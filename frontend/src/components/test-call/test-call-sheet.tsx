import { PipecatClient } from '@pipecat-ai/client-js'
import { SmallWebRTCTransport } from '@pipecat-ai/small-webrtc-transport'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, Mic, PhoneCall, PhoneOff, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { AgentAvatar, LanguageChip, LiveWaveform, StatusPill, ToolCallCard } from '@/components/signature'
import { Segmented } from '@/components/common/segmented'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { apiFetch, ApiError } from '@/lib/api'
import { env } from '@/lib/env'
import { requireSupabase, supabase } from '@/lib/supabase'
import { formatDuration } from '@/lib/time'
import { cn } from '@/lib/utils'

type Phase = 'idle' | 'connecting' | 'live' | 'ended' | 'error'
type Mode = 'browser' | 'phone'

interface PhoneCallState {
  status: string
  current_stage: string | null
  duration_sec: number | null
  outcome: string | null
}

function apiErrorText(e: unknown) {
  if (e instanceof ApiError) {
    try {
      return String((JSON.parse(e.message) as { detail?: unknown }).detail ?? e.message)
    } catch {
      return e.message
    }
  }
  return e instanceof Error ? e.message : 'Something went wrong'
}

interface Turn {
  id: string
  speaker: 'patient' | 'agent' | 'staff' | 'system'
  text: string
  language: 'te' | 'hi' | 'en' | null
  created_at: string
}

interface ToolEvent {
  id: string
  label: string
  at: string
  payload: { arguments?: Record<string, unknown>; ok?: boolean; error_code?: string | null; message?: string; latency_ms?: number }
}

type FeedItem = ({ kind: 'turn' } & Turn) | ({ kind: 'tool' } & ToolEvent)

/** Find the web call the voice service just created (it starts on connect). */
async function findCallId(since: string): Promise<string | null> {
  for (let i = 0; i < 20; i++) {
    const { data } = await requireSupabase()
      .from('calls')
      .select('id')
      .eq('channel', 'web')
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(1)
    if (data?.[0]) return data[0].id as string
    await new Promise((r) => setTimeout(r, 500))
  }
  return null
}

export function TestCallSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [mode, setMode] = useState<Mode>('phone')
  const [phone, setPhone] = useState('')
  const [dialing, setDialing] = useState(false)
  const [phoneCall, setPhoneCall] = useState<PhoneCallState | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [callId, setCallId] = useState<string | null>(null)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [botSpeaking, setBotSpeaking] = useState(false)
  const [userSpeaking, setUserSpeaking] = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const client = useRef<PipecatClient | null>(null)
  const audio = useRef<HTMLAudioElement>(null)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (phase !== 'live') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [phase])

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [feed.length])

  // Live transcript + tool calls for this call via Supabase Realtime.
  useEffect(() => {
    if (!callId || !supabase) return
    const sb = supabase
    let cancelled = false
    const add = (items: FeedItem[]) =>
      setFeed((prev) => {
        const seen = new Set(prev.map((p) => p.id))
        return [...prev, ...items.filter((i) => !seen.has(i.id))].sort((a, b) =>
          (a.kind === 'turn' ? a.created_at : a.at).localeCompare(b.kind === 'turn' ? b.created_at : b.at),
        )
      })
    Promise.all([
      sb.from('call_transcripts').select('id, speaker, text, language, created_at').eq('call_id', callId),
      sb.from('call_events').select('id, label, at, payload').eq('call_id', callId).eq('type', 'tool_call'),
    ]).then(([t, e]) => {
      if (cancelled) return
      add([...(t.data ?? []).map((x) => ({ kind: 'turn' as const, ...(x as Turn) })), ...(e.data ?? []).map((x) => ({ kind: 'tool' as const, ...(x as ToolEvent) }))])
    })
    const channel = sb
      .channel(`test-call:${callId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_transcripts', filter: `call_id=eq.${callId}` }, (p) =>
        add([{ kind: 'turn', ...(p.new as Turn) }]),
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_events', filter: `call_id=eq.${callId}` }, (p) => {
        const ev = p.new as ToolEvent & { type: string }
        if (ev.type === 'tool_call') add([{ kind: 'tool', ...ev }])
      })
      .subscribe()
    return () => {
      cancelled = true
      sb.removeChannel(channel)
    }
  }, [callId])

  // Phone mode: follow the call row (status/stage) live.
  useEffect(() => {
    if (mode !== 'phone' || !callId || !supabase) return
    const sb = supabase
    sb.from('calls').select('status, current_stage, duration_sec, outcome').eq('id', callId).single().then(({ data }) => data && setPhoneCall(data as PhoneCallState))
    const ch = sb
      .channel(`phone-call:${callId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${callId}` }, (p) => setPhoneCall(p.new as PhoneCallState))
      .subscribe()
    return () => {
      sb.removeChannel(ch)
    }
  }, [mode, callId])

  const dial = useCallback(async () => {
    setError(null)
    setFeed([])
    setPhoneCall(null)
    setDialing(true)
    try {
      const r = await apiFetch<{ call_id: string; patient: string | null }>('/api/calls/outbound', { method: 'POST', body: JSON.stringify({ phone }) })
      setCallId(r.call_id)
    } catch (e) {
      setError(apiErrorText(e))
    } finally {
      setDialing(false)
    }
  }, [phone])

  const stop = useCallback(async () => {
    await client.current?.disconnect().catch(() => undefined)
    client.current = null
    setBotSpeaking(false)
    setUserSpeaking(false)
    setPhase((p) => (p === 'error' ? p : 'ended'))
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setFeed([])
    setCallId(null)
    setPhase('connecting')
    const since = new Date(Date.now() - 5000).toISOString()
    const pc = new PipecatClient({
      transport: new SmallWebRTCTransport(),
      enableMic: true,
      enableCam: false,
      callbacks: {
        onTrackStarted: (track, participant) => {
          if (!participant?.local && track.kind === 'audio' && audio.current) {
            audio.current.srcObject = new MediaStream([track])
            void audio.current.play().catch(() => undefined)
          }
        },
        onBotStartedSpeaking: () => setBotSpeaking(true),
        onBotStoppedSpeaking: () => setBotSpeaking(false),
        onUserStartedSpeaking: () => setUserSpeaking(true),
        onUserStoppedSpeaking: () => setUserSpeaking(false),
        onDisconnected: () => setPhase((p) => (p === 'live' || p === 'connecting' ? 'ended' : p)),
      },
    })
    client.current = pc
    try {
      await pc.connect({ webrtcRequestParams: { endpoint: `${env.voiceUrl}/api/offer` } })
      setPhase('live')
      setStartedAt(Date.now())
      setCallId(await findCallId(since))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect to the voice service')
      setPhase('error')
      await pc.disconnect().catch(() => undefined)
    }
  }, [])

  useEffect(
    () => () => {
      void client.current?.disconnect()
    },
    [],
  )

  const busy = phase === 'connecting'
  const live = phase === 'live'

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) void stop()
        onOpenChange(o)
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[480px]">
        <audio ref={audio} autoPlay className="hidden" />
        <div className="border-b px-6 pt-6 pb-5">
          <div className="flex items-center gap-3 pr-8">
            <AgentAvatar agentKey="appointment" active={live} />
            <div className="min-w-0">
              <SheetTitle className="font-heading text-lg font-bold">Test Call</SheetTitle>
              <SheetDescription className="text-xs">Call a real phone, or talk to the agent in your browser — Telugu, Hindi or English.</SheetDescription>
            </div>
          </div>
        </div>

        <div className="flex justify-center border-b bg-card px-6 pt-4">
          <Segmented
            label="Call type"
            value={mode}
            onChange={(m) => {
              if (live || busy) return
              setMode(m)
              setFeed([])
              setCallId(null)
              setPhoneCall(null)
              setError(null)
            }}
            options={[
              { value: 'phone', label: <><Smartphone className="size-3.5" /> Phone call</> },
              { value: 'browser', label: <><Mic className="size-3.5" /> Browser</> },
            ]}
          />
        </div>

        {mode === 'phone' ? (
          <div className="space-y-3 border-b bg-card px-6 py-5">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void dial()
              }}
            >
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                inputMode="tel"
                aria-label="Phone number to call"
                className="h-10 font-mono"
              />
              <Button type="submit" className="h-10" disabled={dialing || phone.replace(/\D/g, '').length < 10 || (phoneCall?.status === 'live')}>
                {dialing ? <Loader2 className="animate-spin" /> : <PhoneCall />} Call now
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              The Follow-up agent calls this number via Bolna and talks about the patient's next appointment. A registered patient's number gets a personalised call.
            </p>
            {error && <p className="text-sm text-critical">{error}</p>}
            {phoneCall && (
              <div className="flex items-center gap-3 rounded-md bg-muted/60 px-3 py-2">
                <StatusPill
                  tone={phoneCall.status === 'live' ? 'live' : phoneCall.status === 'completed' ? 'ok' : 'critical'}
                  pulse={phoneCall.status === 'live'}
                >
                  {phoneCall.status === 'live' ? phoneCall.current_stage ?? 'dialing' : phoneCall.status.replace('_', ' ')}
                </StatusPill>
                {phoneCall.status === 'live' && <LiveWaveform bars={6} />}
                {phoneCall.duration_sec !== null && <span className="font-mono text-xs text-muted-foreground tabular">{formatDuration(phoneCall.duration_sec)}</span>}
                {phoneCall.outcome && <span className="ml-auto text-xs text-muted-foreground">{phoneCall.outcome}</span>}
              </div>
            )}
          </div>
        ) : (
        <div className="flex flex-col items-center gap-4 border-b bg-card px-6 py-6">
          <button
            type="button"
            onClick={() => (live || busy ? void stop() : void start())}
            className={cn(
              'relative inline-flex size-20 items-center justify-center rounded-full text-white shadow-lift transition-colors outline-none focus-visible:ring-4 focus-visible:ring-ring/40',
              live ? 'bg-critical hover:bg-critical/90' : 'bg-primary hover:bg-primary/90',
            )}
            aria-label={live ? 'End call' : 'Start call'}
          >
            {live && <span className="absolute inset-0 animate-live-ring rounded-full border-2 border-live" />}
            {busy ? <Loader2 className="size-7 animate-spin" /> : live ? <PhoneOff className="size-7" /> : <Mic className="size-7" />}
          </button>
          <div className="flex h-6 items-center gap-3">
            {live ? (
              <>
                <StatusPill tone={botSpeaking ? 'ai' : userSpeaking ? 'live' : 'ok'} pulse>
                  {botSpeaking ? 'Agent speaking' : userSpeaking ? 'Listening to you' : 'Connected'}
                </StatusPill>
                <LiveWaveform active={botSpeaking || userSpeaking} bars={7} barClassName={botSpeaking ? 'bg-ai' : undefined} />
                <span className="font-mono text-xs text-muted-foreground tabular">{startedAt ? formatDuration((now - startedAt) / 1000) : '00:00'}</span>
              </>
            ) : busy ? (
              <span className="text-sm text-muted-foreground">Connecting… allow microphone access</span>
            ) : phase === 'ended' ? (
              <span className="text-sm text-muted-foreground">Call ended. Tap to call again.</span>
            ) : phase === 'error' ? (
              <span className="text-sm text-critical">{error}</span>
            ) : (
              <span className="text-sm text-muted-foreground">Tap the mic to start</span>
            )}
          </div>
        </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
          {feed.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {mode === 'phone'
                ? phoneCall?.status === 'live'
                  ? 'Call in progress — the full transcript appears here when it ends.'
                  : 'Enter a number and press Call now.'
                : live
                  ? 'Transcript appears here as you talk.'
                  : 'Try: "నాకు రేపు Dr. Ramesh తో appointment కావాలి"'}
            </p>
          )}
          <AnimatePresence initial={false}>
            {feed.map((f) =>
              f.kind === 'tool' ? (
                <ToolCallCard
                  key={f.id}
                  name={f.label}
                  args={f.payload.arguments}
                  status={f.payload.ok ? 'ok' : f.payload.error_code === 'VERIFICATION_REQUIRED' || f.payload.error_code === 'NOT_ALLOWED' || f.payload.error_code === 'HOLD_REQUIRED' ? 'denied' : 'error'}
                  message={f.payload.message}
                  latencyMs={f.payload.latency_ms}
                />
              ) : (
                <motion.div
                  key={f.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn('flex', f.speaker === 'patient' ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed',
                      f.speaker === 'patient' ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border bg-card',
                    )}
                  >
                    <p lang={f.language ?? undefined}>{f.text}</p>
                    {f.language && (
                      <div className="mt-1 flex justify-end">
                        <LanguageChip lang={f.language} className={f.speaker === 'patient' ? 'bg-white/15 text-white ring-white/25' : undefined} />
                      </div>
                    )}
                  </div>
                </motion.div>
              ),
            )}
          </AnimatePresence>
          <div ref={bottom} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
