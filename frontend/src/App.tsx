import { useEffect, useRef, useState } from 'react'
import './App.css'

type WorkerRecord = {
  id: string | number
  name: string
  identifier: string
  department: string
  active: boolean
  status: string
}

type RequestState = 'idle' | 'loading' | 'error'
type InferencePrediction = {
  className: string
  confidence: number
  x: number
  y: number
  width: number
  height: number
}
type AccessSession = {
  status: 'active' | 'completed' | 'cancelled'
  decision: 'granted' | 'denied' | null
  denialReason: string | null
  stableFrames: number
  missingEquipment: string[]
}
type InferenceResult = {
  predictions: InferencePrediction[]
  image: { width: number; height: number }
  personCount: number
  equipment: { person: boolean; helmet: boolean; vest: boolean }
  confidenceThreshold: number
  session: AccessSession
}

type InferenceState = 'idle' | 'loading' | 'ready' | 'error'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function firstText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).trim()
      if (text) return text
    }
  }
  return ''
}

function workerFromResponse(payload: unknown, searchedIdentifier: string): WorkerRecord | null {
  const response = asRecord(payload)
  const candidate = asRecord(response.worker ?? response.employee ?? response.data ?? payload)
  const rawId = candidate.id ?? candidate.workerId ?? candidate.employeeId
  const id = typeof rawId === 'number' ? rawId : typeof rawId === 'string' ? rawId.trim() : ''
  const name = firstText(candidate, ['name', 'fullName', 'workerName', 'employeeName'])
  if (id === '' && !name) return null

  const statusValue = firstText(candidate, ['status', 'state', 'employmentStatus']).toLowerCase()
  const activeValue = candidate.isActive ?? candidate.active ?? candidate.enabled
  const inactiveStatuses = ['inactive', 'disabled', 'suspended', 'inactivo', 'inactiva', 'deshabilitado', 'deshabilitada']
  const activeStatuses = ['active', 'enabled', 'activo', 'activa', 'habilitado', 'habilitada']
  const active = typeof activeValue === 'boolean'
    ? activeValue
    : activeStatuses.includes(statusValue)
  const isInactive = (typeof activeValue === 'boolean' && !activeValue) || inactiveStatuses.includes(statusValue)

  return {
    id,
    name: name || 'Nombre no disponible',
    identifier: firstText(candidate, ['identifier', 'code', 'workerCode', 'employeeCode']) || searchedIdentifier,
    department: firstText(candidate, ['department', 'area', 'team']) || 'Sin área asignada',
    active: isInactive ? false : active,
    status: isInactive ? 'Inactivo' : active ? 'Activo' : 'Estado sin confirmar',
  }
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const payload = asRecord(await response.json())
    const nestedError = asRecord(payload.error)
    return firstText(nestedError, ['message']) || firstText(payload, ['message', 'error', 'detail', 'title'])
  } catch {
    return ''
  }
}

function inferenceFromResponse(payload: unknown): InferenceResult {
  const response = asRecord(payload)
  const image = asRecord(response.image)
  const equipment = asRecord(response.equipment)
  const predictions = response.predictions
  const session = asRecord(response.session)
  const isPositiveNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
  const isUnitInterval = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
  const imageWidth = image.width
  const imageHeight = image.height

  if (!Array.isArray(predictions) || !isPositiveNumber(imageWidth) || !isPositiveNumber(imageHeight)
    || !Number.isInteger(response.personCount) || (response.personCount as number) < 0
    || typeof equipment.person !== 'boolean' || typeof equipment.helmet !== 'boolean' || typeof equipment.vest !== 'boolean'
    || !['active', 'completed', 'cancelled'].includes(String(session.status))
    || (session.decision !== null && session.decision !== 'granted' && session.decision !== 'denied')
    || (session.denialReason !== null && typeof session.denialReason !== 'string')
    || !Number.isInteger(session.stableFrames) || (session.stableFrames as number) < 0
    || !Array.isArray(session.missingEquipment) || session.missingEquipment.some((item) => typeof item !== 'string')
    || !isUnitInterval(response.confidenceThreshold)) {
    throw new Error('El servidor devolvió una respuesta de análisis no válida.')
  }

  const parsedPredictions = predictions.map((value): InferencePrediction => {
    const prediction = asRecord(value)
    const coordinates = [prediction.x, prediction.y, prediction.width, prediction.height]
    if (typeof prediction.class !== 'string' || !prediction.class.trim()
      || !isUnitInterval(prediction.confidence)
      || coordinates.some((coordinate) => typeof coordinate !== 'number' || !Number.isFinite(coordinate))) {
      throw new Error('El servidor devolvió una detección no válida.')
    }
    const [x, y, width, height] = coordinates as number[]
    if (width <= 0 || height <= 0 || x < 0 || y < 0 || x + width > imageWidth || y + height > imageHeight) {
      throw new Error('El servidor devolvió una caja de detección fuera de la imagen.')
    }
    return { className: prediction.class.trim(), confidence: prediction.confidence, x, y, width, height }
  })

  return {
    predictions: parsedPredictions,
    image: { width: imageWidth, height: imageHeight },
    personCount: response.personCount as number,
    equipment: { person: equipment.person, helmet: equipment.helmet, vest: equipment.vest },
    confidenceThreshold: response.confidenceThreshold,
    session: {
      status: session.status as AccessSession['status'],
      decision: session.decision as AccessSession['decision'],
      denialReason: session.denialReason as string | null,
      stableFrames: session.stableFrames as number,
      missingEquipment: session.missingEquipment as string[],
    },
  }
}

function equipmentLabel(equipment: string): string {
  const normalized = equipment.toLowerCase()
  if (normalized === 'helmet' || normalized === 'casco') return 'casco'
  if (normalized === 'vest' || normalized === 'chaleco') return 'chaleco'
  return equipment
}

function accessStatusText(result: InferenceResult | null, inferenceState: InferenceState): string {
  if (inferenceState === 'error') return 'Sin lectura · no es una decisión de acceso'
  if (!result) return 'Pendiente'
  const { session } = result
  if (session.status === 'completed') {
    if (session.decision === 'granted') return 'Acceso permitido'
    if (session.decision === 'denied') return `Acceso denegado: ${session.denialReason || 'motivo no especificado'}`
    return 'Decisión no disponible'
  }
  if (session.status === 'cancelled') return 'Verificación cancelada'
  if (result.personCount === 0) return 'Colócate frente a la cámara'
  if (result.personCount > 1) return 'Solo una persona a la vez'
  if (session.missingEquipment.length > 0) {
    const missing = session.missingEquipment.map(equipmentLabel)
    const items = missing.length > 1 ? `${missing.slice(0, -1).join(', ')} y ${missing[missing.length - 1]}` : missing[0]
    return `${missing.length > 1 ? 'Faltan' : 'Falta'} ${items} · Provisional`
  }
  return `Equipo completo · estabilidad ${session.stableFrames}/5`
}

function hasMissingEquipment(result: InferenceResult, equipment: string): boolean {
  return result.session.missingEquipment.some((item) => item.toLowerCase() === equipment)
}

function App() {
  const [identifier, setIdentifier] = useState('')
  const [worker, setWorker] = useState<WorkerRecord | null>(null)
  const [lookupState, setLookupState] = useState<RequestState>('idle')
  const [lookupMessage, setLookupMessage] = useState('')
  const [sessionState, setSessionState] = useState<RequestState>('idle')
  const [sessionMessage, setSessionMessage] = useState('')
  const [sessionStarted, setSessionStarted] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [cameraState, setCameraState] = useState<'idle' | 'ready' | 'denied' | 'unavailable'>('idle')
  const [inferenceState, setInferenceState] = useState<InferenceState>('idle')
  const [inferenceResult, setInferenceResult] = useState<InferenceResult | null>(null)
  const [inferenceMessage, setInferenceMessage] = useState('')
  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const overlayRef = useRef<HTMLCanvasElement | null>(null)
  const inferenceInFlightRef = useRef(false)
  const inferenceControllerRef = useRef<AbortController | null>(null)
  const cameraRequestRef = useRef(0)
  const sessionEndedRef = useRef(false)
  const accessStatusClass = inferenceResult?.session.status === 'completed'
    ? inferenceResult.session.decision === 'granted' ? 'status-granted' : inferenceResult.session.decision === 'denied' ? 'status-denied' : 'status-undetermined'
    : inferenceResult?.session.status === 'cancelled' ? 'status-cancelled' : ''
  const analysisStatusClass = inferenceResult?.session.status === 'completed'
    ? inferenceResult.session.decision === 'granted' ? 'analysis-granted' : inferenceResult.session.decision === 'denied' ? 'analysis-denied' : ''
    : inferenceState === 'ready' ? 'analysis-current' : inferenceState === 'error' ? 'analysis-error' : ''

  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [cameraState])

  useEffect(() => () => {
    cameraRequestRef.current += 1
    inferenceControllerRef.current?.abort()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    if (cameraState !== 'ready' || !sessionId) {
      return
    }

    let active = true
    let timer: number | null = null
    const captureAndInfer = async () => {
      const video = videoRef.current
      if (!active || sessionEndedRef.current || !video || video.videoWidth <= 0 || video.videoHeight <= 0 || inferenceInFlightRef.current) return

      const scale = Math.min(1, 640 / video.videoWidth)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        setInferenceState('error')
        setInferenceMessage('No se pudo preparar la imagen de la cámara.')
        return
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const image = canvas.toDataURL('image/jpeg', 0.6)
      canvas.width = 0
      canvas.height = 0

      inferenceInFlightRef.current = true
      setInferenceState('loading')
      setInferenceMessage('')
      const controller = new AbortController()
      inferenceControllerRef.current = controller
      const timeout = window.setTimeout(() => controller.abort(), 20000)
      try {
        const response = await fetch(`${API_BASE_URL}/api/access-sessions/${encodeURIComponent(sessionId)}/inference`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image }),
          signal: controller.signal,
        })
        if (!response.ok) {
          const detail = await responseMessage(response)
          throw new Error(detail || `El análisis respondió con el código ${response.status}.`)
        }
        const result = inferenceFromResponse(await response.json())
        if (!active) return
        setInferenceResult(result)
        setInferenceState('ready')
        if (result.session.status !== 'active') {
          sessionEndedRef.current = true
          if (timer !== null) window.clearInterval(timer)
        }
      } catch (error) {
        if (!active) return
        setInferenceResult(null)
        setInferenceState('error')
        setInferenceMessage(controller.signal.aborted
          ? 'El análisis agotó el tiempo de espera. Se reintentará con la siguiente captura.'
          : error instanceof TypeError
            ? 'No se pudo conectar con el servicio de análisis. Se reintentará con la siguiente captura.'
            : error instanceof Error ? error.message : 'No se pudo analizar la captura.')
      } finally {
        window.clearTimeout(timeout)
        inferenceInFlightRef.current = false
        if (inferenceControllerRef.current === controller) inferenceControllerRef.current = null
      }
    }

    void captureAndInfer()
    timer = window.setInterval(() => { void captureAndInfer() }, 1000)
    return () => {
      active = false
      window.clearInterval(timer)
      inferenceControllerRef.current?.abort()
    }
  }, [cameraState, sessionId])

  useEffect(() => {
    const canvas = overlayRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const drawOverlay = () => {
      const bounds = canvas.getBoundingClientRect()
      const pixelRatio = window.devicePixelRatio || 1
      canvas.width = Math.round(bounds.width * pixelRatio)
      canvas.height = Math.round(bounds.height * pixelRatio)
      const context = canvas.getContext('2d')
      if (!context) return
      context.scale(pixelRatio, pixelRatio)
      context.clearRect(0, 0, bounds.width, bounds.height)
      if (!inferenceResult || video.videoWidth <= 0 || video.videoHeight <= 0) return

      const imageWidth = inferenceResult.image.width
      const imageHeight = inferenceResult.image.height
      const scale = Math.max(bounds.width / imageWidth, bounds.height / imageHeight)
      const offsetX = (bounds.width - imageWidth * scale) / 2
      const offsetY = (bounds.height - imageHeight * scale) / 2
      inferenceResult.predictions.forEach((prediction) => {
        const x = offsetX + prediction.x * scale
        const y = offsetY + prediction.y * scale
        const width = prediction.width * scale
        const height = prediction.height * scale
        context.strokeStyle = '#b5ee76'
        context.lineWidth = 2
        context.strokeRect(x, y, width, height)
        const label = `${prediction.className} ${Math.round(prediction.confidence * 100)}%`
        context.font = '12px Segoe UI, sans-serif'
        const labelWidth = context.measureText(label).width + 10
        const labelY = Math.max(0, y - 22)
        context.fillStyle = '#193426'
        context.fillRect(x, labelY, labelWidth, 20)
        context.fillStyle = '#ffffff'
        context.fillText(label, x + 5, labelY + 14)
      })
    }

    drawOverlay()
    const observer = new ResizeObserver(drawOverlay)
    observer.observe(canvas)
    video.addEventListener('loadedmetadata', drawOverlay)
    return () => {
      observer.disconnect()
      video.removeEventListener('loadedmetadata', drawOverlay)
    }
  }, [cameraState, inferenceResult])

  async function lookupWorker(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = identifier.trim()
    if (!query) {
      setLookupState('error')
      setLookupMessage('Escribe un código o nombre para continuar.')
      return
    }

    setWorker(null)
    setLookupState('loading')
    setLookupMessage('')
    setSessionState('idle')
    setSessionMessage('')
    try {
      const response = await fetch(`${API_BASE_URL}/api/workers/lookup?identifier=${encodeURIComponent(query)}`)
      if (response.status === 404) {
        setLookupState('error')
        setLookupMessage('No encontramos a ninguna persona con ese código o nombre.')
        return
      }
      if (!response.ok) {
        const detail = await responseMessage(response)
        throw new Error(detail || `El servicio respondió con el código ${response.status}.`)
      }

      const result = workerFromResponse(await response.json(), query)
      if (!result) {
        setLookupState('error')
        setLookupMessage('La respuesta del servicio no contiene un empleado válido.')
        return
      }
      setWorker(result)
      setLookupState('idle')
    } catch (error) {
      setLookupState('error')
      setLookupMessage(error instanceof TypeError
        ? 'No se pudo conectar con el servidor. Comprueba que el backend esté en línea.'
        : error instanceof Error ? error.message : 'No se pudo consultar el empleado.')
    }
  }

  async function startSession() {
    if (!worker || worker.id === '' || !worker.active) return
    sessionEndedRef.current = false
    setInferenceResult(null)
    setInferenceState('idle')
    setInferenceMessage('')
    setSessionState('loading')
    setSessionMessage('')
    try {
      const response = await fetch(`${API_BASE_URL}/api/access-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: worker.identifier }),
      })
      if (!response.ok) {
        const detail = await responseMessage(response)
        throw new Error(detail || `No se pudo iniciar la sesión (código ${response.status}).`)
      }

      const sessionPayload = asRecord(await response.json())
      const session = asRecord(sessionPayload.session)
      const createdSessionId = firstText(session, ['id'])
      if (!createdSessionId) throw new Error('El servidor no devolvió el identificador de la sesión.')
      setSessionId(createdSessionId)
      setSessionState('idle')
      setSessionStarted(true)
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState('unavailable')
        setSessionMessage('La sesión se inició, pero este navegador no permite acceder a la cámara.')
        return
      }
      const cameraRequest = ++cameraRequestRef.current
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        if (cameraRequest !== cameraRequestRef.current) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        setCameraState('ready')
      } catch (error) {
        if (cameraRequest !== cameraRequestRef.current) return
        setCameraState(error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'unavailable')
        setSessionMessage(error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'La sesión se inició, pero se denegó el permiso de cámara. Habilítalo en el navegador para continuar.'
          : 'La sesión se inició, pero no fue posible abrir la cámara.')
      }
    } catch (error) {
      setSessionState('error')
      setSessionMessage(error instanceof TypeError
        ? 'No se pudo conectar con el servidor. Comprueba que el backend esté en línea.'
        : error instanceof Error ? error.message : 'No se pudo iniciar la sesión.')
    }
  }

  async function cancelSession() {
    cameraRequestRef.current += 1
    sessionEndedRef.current = true
    inferenceControllerRef.current?.abort()
    inferenceControllerRef.current = null
    inferenceInFlightRef.current = false
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraState('idle')
    setInferenceState('idle')
    setInferenceResult(null)
    setInferenceMessage('')
    if (!sessionId) {
      setSessionStarted(false)
      setSessionMessage('Cámara detenida.')
      return
    }

    if (inferenceResult && inferenceResult.session.status !== 'active') {
      setSessionStarted(false)
      setSessionId(null)
      setSessionState('idle')
      setSessionMessage('Resultado cerrado. Puedes iniciar otro intento.')
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/access-sessions/${encodeURIComponent(sessionId)}/cancel`, { method: 'POST' })
      if (!response.ok) {
        const detail = await responseMessage(response)
        throw new Error(detail || `No se pudo cerrar la sesión (código ${response.status}).`)
      }
      setSessionStarted(false)
      setSessionId(null)
      setSessionState('idle')
      setSessionMessage('Sesión cancelada. No se registró una decisión de acceso.')
    } catch (error) {
      setSessionState('error')
      setSessionMessage(error instanceof TypeError
        ? 'La cámara se detuvo, pero no se pudo cerrar la sesión en el servidor. Comprueba la conexión e inténtalo de nuevo.'
        : error instanceof Error ? error.message : 'La cámara se detuvo, pero no se pudo cerrar la sesión en el servidor.')
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="Smart Safety Access System, inicio">
          <span className="brand-mark" aria-hidden="true">SA</span>
          <span className="brand-name">SMART SAFETY <strong>ACCESS</strong></span>
        </a>
        <div className="station-label"><span className="status-dot" />Punto de acceso</div>
      </header>

      <main id="inicio">
        <section className="page-heading" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">CONTROL DE INGRESO</p>
            <h1 id="page-title">Verificación de seguridad</h1>
            <p className="page-description">Identifica al personal y prepara la revisión de equipo de protección.</p>
          </div>
          <div className="step-indicator" aria-label="Paso 1 de 2">
            <span className="step-current">01</span><span className="step-divider" /><span>02</span>
            <span className="step-caption">Identificación <span aria-hidden="true">·</span> Cámara</span>
          </div>
        </section>

        <div className="workflow-grid">
          <section className="lookup-panel" aria-labelledby="lookup-title">
            <div className="section-heading">
              <span className="section-index">01</span>
              <div>
                <h2 id="lookup-title">Identificar empleado</h2>
                <p>Busca por código o nombre completo.</p>
              </div>
            </div>

            <form className="lookup-form" onSubmit={lookupWorker}>
              <label htmlFor="worker-identifier">Código o nombre</label>
              <div className="input-row">
                <input
                  id="worker-identifier"
                  name="identifier"
                  type="text"
                  autoComplete="off"
                  placeholder="Ej. 004821 o Ana García"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  disabled={sessionStarted}
                  aria-invalid={lookupState === 'error'}
                  aria-describedby={lookupMessage ? 'lookup-message' : undefined}
                />
                <button className="button button-secondary" type="submit" disabled={lookupState === 'loading' || sessionStarted}>
                  {lookupState === 'loading' ? 'Buscando…' : 'Consultar'}
                </button>
              </div>
              {lookupMessage && <p id="lookup-message" className="feedback feedback-error" role="alert">{lookupMessage}</p>}
            </form>

            <div className="employee-result" aria-live="polite" aria-busy={lookupState === 'loading'}>
              {worker ? (
                <>
                  <div className="result-topline"><span>REGISTRO ENCONTRADO</span><span className={`employee-status ${worker.active ? 'is-active' : 'is-inactive'}`}><span />{worker.status}</span></div>
                  <div className="employee-details">
                    <div className="avatar" aria-hidden="true">{worker.name.slice(0, 1).toUpperCase()}</div>
                    <div className="employee-identity">
                      <h3>{worker.name}</h3>
                      <p>{worker.department}</p>
                    </div>
                  </div>
                  <dl className="employee-meta">
                    <div><dt>Código</dt><dd>{worker.identifier}</dd></div>
                    <div><dt>Estado</dt><dd>{worker.status}</dd></div>
                  </dl>
                  {!worker.active && <p className="feedback feedback-warning" role="status">El empleado está inactivo. No se puede iniciar una verificación.</p>}
                  {worker.active && worker.id === '' && <p className="feedback feedback-warning" role="status">El registro no incluye un identificador para iniciar la sesión.</p>}
                </>
              ) : (
                <div className="empty-result">
                  <span className="empty-mark" aria-hidden="true">—</span>
                  <p>Los datos del empleado aparecerán aquí.</p>
                </div>
              )}
            </div>

            <button className="button button-primary start-button" type="button" onClick={startSession} disabled={!worker || worker.id === '' || !worker.active || sessionState === 'loading' || sessionStarted}>
              {sessionState === 'loading' ? 'Iniciando sesión…' : 'Iniciar verificación'}
              <span aria-hidden="true">→</span>
            </button>
            {sessionMessage && <p className={`feedback ${sessionState === 'error' ? 'feedback-error' : 'feedback-warning'}`} role={sessionState === 'error' ? 'alert' : 'status'}>{sessionMessage}</p>}
          </section>

          <section className="camera-panel" aria-labelledby="camera-title">
            <div className="section-heading camera-heading">
              <span className="section-index">02</span>
              <div>
                <h2 id="camera-title">Revisión de equipo</h2>
                <p>Captura en vivo para análisis de seguridad.</p>
              </div>
            </div>

            <div className={`camera-view ${cameraState === 'ready' ? 'camera-live' : ''}`}>
              {cameraState === 'ready' ? (
                <>
                  <video ref={videoRef} autoPlay muted playsInline aria-label="Vista en vivo de la cámara" />
                  <canvas ref={overlayRef} className="detection-overlay" aria-hidden="true" />
                </>
              ) : (
                <div className="camera-placeholder">
                  <span className="camera-symbol" aria-hidden="true"><span /></span>
                  <p>{cameraState === 'denied' ? 'Permiso de cámara denegado' : cameraState === 'unavailable' ? 'Cámara no disponible' : 'La cámara está en espera'}</p>
                  <span>La cámara se activará al iniciar la verificación</span>
                </div>
              )}
              {cameraState === 'ready' && <span className="live-indicator"><span /> EN VIVO</span>}
            </div>

            <div className="analysis-header"><span>LECTURA DEL SISTEMA</span><span className={`analysis-pending ${analysisStatusClass}`}>{inferenceResult?.session.status === 'completed' ? inferenceResult.session.decision ? 'DECISIÓN FINAL' : 'SIN DECISIÓN' : inferenceResult?.session.status === 'cancelled' ? 'CANCELADA' : inferenceState === 'ready' ? 'ACTUALIZADO' : inferenceState === 'loading' ? 'ANALIZANDO' : inferenceState === 'error' ? 'ERROR' : 'PENDIENTE'}</span></div>
            <dl className="checklist">
              <div><dt><span className="check-icon" aria-hidden="true">01</span>Persona</dt><dd>{inferenceState === 'error' ? 'Sin lectura' : inferenceResult ? `${inferenceResult.personCount} ${inferenceResult.personCount === 1 ? 'detectada' : 'detectadas'} · ${inferenceResult.equipment.person ? 'presente' : 'no detectada'}` : 'Pendiente'}</dd></div>
              <div><dt><span className="check-icon" aria-hidden="true">02</span>Casco</dt><dd>{inferenceState === 'error' ? 'Sin lectura' : inferenceResult ? hasMissingEquipment(inferenceResult, 'helmet') ? 'Faltante' : inferenceResult.equipment.helmet ? 'Detectado' : 'No detectado' : 'Pendiente'}</dd></div>
              <div><dt><span className="check-icon" aria-hidden="true">03</span>Chaleco</dt><dd>{inferenceState === 'error' ? 'Sin lectura' : inferenceResult ? hasMissingEquipment(inferenceResult, 'vest') ? 'Faltante' : inferenceResult.equipment.vest ? 'Detectado' : 'No detectado' : 'Pendiente'}</dd></div>
              <div className={`overall-status ${accessStatusClass}`}><dt>Estado de acceso</dt><dd>{accessStatusText(inferenceResult, inferenceState)}</dd></div>
            </dl>
            {inferenceResult && <p className="inference-summary">{inferenceResult.predictions.length} detecciones · umbral {Math.round(inferenceResult.confidenceThreshold * 100)}%</p>}
            {inferenceMessage && <p className="feedback feedback-error" role="alert">{inferenceMessage}</p>}
            <p className="integration-note">{cameraState === 'ready' ? 'Cámara activa: Roboflow analiza una captura JPEG por segundo para detectar persona, casco y chaleco. El acceso se decide automáticamente al estabilizarse la lectura. No se guardan imágenes ni se analizan rostros.' : 'Inicia una verificación para activar la cámara y el análisis automático de equipo de protección.'}</p>
            {sessionStarted && <button className="button button-cancel" type="button" onClick={cancelSession}>{inferenceResult && inferenceResult.session.status !== 'active' ? 'Cerrar resultado y detener cámara' : 'Cancelar sesión y detener cámara'}</button>}
          </section>
        </div>

        <footer className="page-footer"><span>SMART SAFETY ACCESS SYSTEM</span><span>Detección automática de equipo · Sin reconocimiento facial</span></footer>
      </main>
    </div>
  )
}

export default App
