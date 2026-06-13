import { useCallback, useMemo, useRef, useState } from 'react'

type SpeechRecognitionConstructor = new () => SpeechRecognition

type SpeechRecognitionEventResult = {
  isFinal: boolean
  0: { transcript: string }
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: {
    length: number
    [index: number]: SpeechRecognitionEventResult
  }
}

type SpeechRecognitionErrorEventLike = {
  error: string
}

type SpeechRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  start: () => void
  stop: () => void
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
    webkitAudioContext?: typeof AudioContext
  }
}

export type SpeechState = {
  supported: boolean
  listening: boolean
  interimText: string
  error: string
  start: () => void
  stop: () => void
}

export type SpeechRecognitionOptions = {
  onFinalText: (text: string) => void
  onInterimText?: (text: string) => void
}

export function useSpeechRecognition(options: SpeechRecognitionOptions | ((text: string) => void)): SpeechState {
  const onFinalText = typeof options === 'function' ? options : options.onFinalText
  const onInterimText = typeof options === 'function' ? undefined : options.onInterimText
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const [listening, setListening] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState('')

  const supported = useMemo(
    () => typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    [],
  )

  const getRecognition = useCallback(() => {
    if (recognitionRef.current) return recognitionRef.current
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) return null
    const recognition = new Recognition()
    recognition.lang = 'zh-CN'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onstart = () => setListening(true)
    recognition.onend = () => setListening(false)
    recognition.onerror = (event) => {
      setError(event.error)
      setListening(false)
    }
    recognition.onresult = (event) => {
      let interim = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result[0].transcript.trim()
        if (result.isFinal) {
          setInterimText('')
          onInterimText?.('')
          onFinalText(transcript)
        } else {
          interim += transcript
        }
      }
      setInterimText(interim)
      onInterimText?.(interim)
    }
    recognitionRef.current = recognition
    return recognition
  }, [onFinalText, onInterimText])

  const start = useCallback(() => {
    setError('')
    getRecognition()?.start()
  }, [getRecognition])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  return { supported, listening, interimText, error, start, stop }
}
