/**
 * A console model floating and turning in a transparent canvas. Plain module, no
 * React: the home page wraps it in a component, and it can also be bundled alone
 * to test the render in a browser. three.js is imported lazily, so it costs
 * nothing until a console is actually shown.
 */
export interface MountOptions {
  url: string
  /** Euler angles (radians) that stand the model upright with its front toward +Z. */
  baseRotation?: [number, number, number]
  /** A fixed view (radians) for tests: when set, nothing spins or floats. */
  yaw?: number
  pitch?: number
  /** Seconds per full turn. */
  turnSeconds?: number
  /** Draw the model's own X (red), Y (green) and Z (blue) axes: for the orientation editor. */
  axes?: boolean
}

export interface ConsoleHandle {
  dispose(): void
  /** Re-orient the model and re-frame it. */
  setBaseRotation(rotation: [number, number, number]): void
  /** true: the floating turn of the home page; false: hold still and orbit by dragging. */
  setSpin(on: boolean): void
}

export async function mountConsole(container: HTMLElement, opts: MountOptions): Promise<ConsoleHandle> {
  const [THREE, loaderMod, meshoptMod, envMod] = await Promise.all([
    import('three'),
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
    import('three/examples/jsm/environments/RoomEnvironment.js'),
  ])

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block'
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envTarget = pmrem.fromScene(new envMod.RoomEnvironment(), 0.04)
  scene.environment = envTarget.texture

  const key = new THREE.DirectionalLight(0xffffff, 1.5)
  key.position.set(2.5, 3, 3)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x8fb4ff, 0.9)
  rim.position.set(-3, 1.5, -2.5)
  scene.add(rim)

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100)

  const loader = new loaderMod.GLTFLoader()
  loader.setMeshoptDecoder(meshoptMod.MeshoptDecoder)
  const gltf = await loader.loadAsync(opts.url)
  const model = gltf.scene
  let baseRotation: [number, number, number] = opts.baseRotation ?? [0, 0, 0]
  // Some Sketchfab models ship a ground or shadow plane several times larger than the
  // console (the PSP's is 46 units across a 17-unit device). It would shrink the
  // console in the frame, so those objects are dropped before measuring.
  const strays: import('three').Object3D[] = []
  model.traverse(o => { if (/(^|[_ .-])(ground|floor|shadow)/i.test(o.name)) strays.push(o) })
  strays.forEach(o => o.removeFromParent())

  // Center the model inside a pivot and scale the pivot, so the same camera frames
  // a Wii and a PSP at the same size and they turn about their own middle.
  const pivot = new THREE.Group()
  pivot.rotation.order = 'YXZ'
  pivot.add(model)
  scene.add(pivot)
  const layout = () => {
    pivot.scale.setScalar(1)
    model.position.set(0, 0, 0)
    model.rotation.set(...baseRotation)
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    model.position.sub(box.getCenter(new THREE.Vector3()))
    pivot.scale.setScalar(1.7 / Math.max(size.x, size.y, size.z, 1e-6))
  }
  layout()
  if (opts.axes) {
    const axes = new THREE.AxesHelper(1.6)
    ;(axes.material as import('three').Material).depthTest = false
    axes.renderOrder = 10
    pivot.add(axes)
  }

  const resize = () => {
    const w = Math.max(1, container.clientWidth)
    const h = Math.max(1, container.clientHeight)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    // A narrow container needs the camera farther back to keep the model whole.
    const dist = 4.1 * Math.max(1, 1.2 / camera.aspect)
    camera.position.set(0, 0.04, dist)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }
  resize()
  const ro = new ResizeObserver(resize)
  ro.observe(container)

  const fixed = opts.yaw !== undefined
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const turn = opts.turnSeconds ?? 18
  let spin = true
  let userYaw = 0.4
  let userPitch = 0.15

  let raf = 0
  let visible = true
  let hidden = typeof document !== 'undefined' && document.hidden
  const start = performance.now()

  const draw = (t: number) => {
    if (fixed) {
      pivot.rotation.set(opts.pitch ?? 0.2, opts.yaw!, 0)
    } else if (!spin) {
      pivot.rotation.set(userPitch, userYaw, 0)
      pivot.position.y = 0
    } else if (reduced) {
      pivot.rotation.set(0.04, 0.5, 0)
    } else {
      // A full turn seen from the front, with a slow float: a small bob and a
      // barely-there nod and roll, so it hangs in the air instead of sitting on a spindle.
      pivot.rotation.set(0.03 + Math.sin(t * 0.6) * 0.03, (t / turn) * Math.PI * 2, Math.sin(t * 0.45) * 0.02)
      pivot.position.y = Math.sin(t * 0.9) * 0.07
    }
    renderer.render(scene, camera)
  }
  const loop = () => {
    raf = requestAnimationFrame(loop)
    draw((performance.now() - start) / 1000)
  }
  const sync = () => {
    cancelAnimationFrame(raf)
    if (fixed || reduced || !spin) { draw(0); return }
    if (visible && !hidden) loop()
  }
  const io = new IntersectionObserver(entries => {
    visible = entries.some(e => e.isIntersecting)
    sync()
  })
  io.observe(container)
  const onVisibility = () => { hidden = document.hidden; sync() }
  document.addEventListener('visibilitychange', onVisibility)
  sync()

  // Dragging orbits the model while it is held still (the editor).
  const canvas = renderer.domElement
  let drag: { x: number; y: number } | null = null
  const down = (e: PointerEvent) => { if (!spin) { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId) } }
  const move = (e: PointerEvent) => {
    if (!drag) return
    userYaw += (e.clientX - drag.x) * 0.01
    userPitch = Math.max(-1.5, Math.min(1.5, userPitch + (e.clientY - drag.y) * 0.01))
    drag = { x: e.clientX, y: e.clientY }
    draw(0)
  }
  const up = () => { drag = null }
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', up)
  canvas.style.touchAction = 'none'

  return {
    setBaseRotation(r) { baseRotation = r; layout(); draw(0) },
    setSpin(on) { spin = on; sync() },
    dispose() {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      scene.traverse(obj => {
        const mesh = obj as import('three').Mesh
        if (!mesh.isMesh) return
        mesh.geometry.dispose()
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const m of mats) {
          for (const v of Object.values(m)) {
            if (v && (v as import('three').Texture).isTexture) (v as import('three').Texture).dispose()
          }
          m.dispose()
        }
      })
      envTarget.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}
