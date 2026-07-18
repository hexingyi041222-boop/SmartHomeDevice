<template>
  <div ref="containerRef" class="house-scene">
    <div v-if="loading" class="scene-placeholder">
      <div class="placeholder-spinner" />
      <p>{{ loadMessage }}</p>
    </div>
    <div v-else-if="loadError" class="scene-placeholder scene-placeholder--error">
      <p>{{ loadError }}</p>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import gsap from 'gsap'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const props = defineProps({
  modelPath: { type: String, default: '/SmartHomeDevice/models/scene.glb' },
  lightOn: { type: Boolean, default: false },
  doorOpen: { type: Boolean, default: false },
  acOn: { type: Boolean, default: false },
})

const containerRef = ref(null)
const loading = ref(true)
const loadError = ref('')
const loadMessage = ref('3D 模型加载中...')

const REAL_DOOR_NAME = 'Cube038'
const LAMP_NAME_KEYS = ['lampion', 'lamp', 'light', '灯', 'bulb', 'shade', '罩', 'möbel', 'mache']

const targetCameraPos = new THREE.Vector3(0, 0.85, 1.2)
const targetTargetPos = new THREE.Vector3(0, 0.85, 2.0)
const AZIMUTH_LIMIT = 0.174
const POLAR_LOCK = 1.57

const AMBIENT_OFF = 0.3
const AMBIENT_ON = 0.8
const DIRECTIONAL_OFF = 0.5
const DIRECTIONAL_ON = 1.0
const DOOR_OPEN_ANGLE = -Math.PI / 2
const DOOR_ANIM_DURATION = 0.5

let renderer = null
let scene = null
let camera = null
let controls = null
let animationId = null
let resizeObserver = null
let modelRoot = null

let ambientLight = null
let directionalLight = null
let lampMeshes = []
let doorPivot = null
let doorNode = null
let doorOriginalLocal = null
let doorTween = null
let debugMountTimeout = null

// 使用不同的变量名
const FIXED_CAMERA_POS = new THREE.Vector3(0, 0.8, 0.8);
const FIXED_TARGET_POS = new THREE.Vector3(0, 0.7, 0.5);

function nameMatches(name, keys) {
  const lower = (name || '').toLowerCase()
  return keys.some((k) => lower.includes(k.toLowerCase()))
}

function findLampMeshes(root) {
  lampMeshes = []
  root.traverse((obj) => {
    if (obj.isMesh && nameMatches(obj.name, LAMP_NAME_KEYS)) {
      lampMeshes.push(obj)
    }
  })
}

function findDoorObject(model) {
  const door = model.getObjectByName(REAL_DOOR_NAME)
  if (door) return door

  let found = null
  model.traverse((child) => {
    if (!found && child.name === REAL_DOOR_NAME) {
      found = child
    }
  })
  return found
}

function ensureMeshMaterial(mesh) {
  if (!mesh.isMesh) return null
  if (Array.isArray(mesh.material)) {
    mesh.material = mesh.material.map((mat) => mat.clone())
    return mesh.material[0]
  }
  if (mesh.material) {
    mesh.material = mesh.material.clone()
    return mesh.material
  }
  return null
}

function setupRealDoor(model) {
  const door = findDoorObject(model)
  if (!door) return false

  const parent = door.parent
  if (!parent) return false

  doorNode = door
  door.updateWorldMatrix(true, true)
  parent.updateWorldMatrix(true, true)

  const worldMatrix = door.matrixWorld.clone()
  const box = new THREE.Box3().setFromObject(door)
  const center = box.getCenter(new THREE.Vector3())
  const hingeOnMaxX = center.x > 0
  const hingeWorld = new THREE.Vector3(
    hingeOnMaxX ? box.max.x : box.min.x,
    (box.min.y + box.max.y) / 2,
    (box.min.z + box.max.z) / 2,
  )

  doorPivot = new THREE.Group()
  doorPivot.name = 'Cube038Pivot'
  doorPivot.position.copy(parent.worldToLocal(hingeWorld.clone()))

  parent.remove(door)
  parent.add(doorPivot)
  doorPivot.add(door)

  doorPivot.updateMatrixWorld(true)
  door.matrix.copy(doorPivot.matrixWorld.clone().invert().multiply(worldMatrix))
  door.matrix.decompose(door.position, door.quaternion, door.scale)

  doorOriginalLocal = {
    position: door.position.clone(),
    quaternion: door.quaternion.clone(),
    scale: door.scale.clone(),
  }
  doorPivot.rotation.y = 0

  return true
}

function restoreDoorClosedTransform() {
  if (!doorNode || !doorPivot || !doorOriginalLocal) return
  doorNode.position.copy(doorOriginalLocal.position)
  doorNode.quaternion.copy(doorOriginalLocal.quaternion)
  doorNode.scale.copy(doorOriginalLocal.scale)
  doorPivot.rotation.y = 0
}

function killDoorTween() {
  if (doorTween) {
    doorTween.kill()
    doorTween = null
  }
}

function applyLightState(on) {
  console.log(`灯光状态变化: ${on ? '开' : '关'}`)

  if (ambientLight) {
    ambientLight.intensity = on ? AMBIENT_ON : AMBIENT_OFF
  }
  if (directionalLight) {
    directionalLight.intensity = on ? DIRECTIONAL_ON : DIRECTIONAL_OFF
  }

  lampMeshes.forEach((mesh) => {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.forEach((m) => {
      if (!m) return
      if (m.emissive) {
        m.emissive.setHex(on ? 0x885522 : 0x000000)
        m.emissiveIntensity = on ? 0.8 : 0
      }
    })
  })
}

function applyDoorState(open) {
  console.log(`门状态变化: ${open ? '开' : '关'}`)

  if (!doorPivot) return

  const target = open ? DOOR_OPEN_ANGLE : 0
  killDoorTween()

  doorTween = gsap.to(doorPivot.rotation, {
    y: target,
    duration: DOOR_ANIM_DURATION,
    ease: 'power2.inOut',
    onComplete: () => {
      if (!open) {
        restoreDoorClosedTransform()
      } else {
        doorPivot.rotation.y = target
      }
      doorTween = null
    },
  })
}

function fitModelToView(model) {
  const box = new THREE.Box3().setFromObject(model)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())

  model.position.x -= center.x
  model.position.y -= box.min.y
  model.position.z -= center.z

  const maxDim = Math.max(size.x, size.y, size.z)
  if (maxDim > 0) {
    model.scale.setScalar(2.8 / maxDim)
  }
}

function mountDebugGlobals(model = null) {
  if (scene) window.__DEBUG_SCENE__ = scene
  if (camera) window.__DEBUG_CAMERA__ = camera
  if (controls) window.__DEBUG_CONTROLS__ = controls
  if (model) {
    window.__DEBUG_MODEL__ = model
    console.log('✅ 模型已挂载到 window.__DEBUG_MODEL__')
  }
  if (camera && controls && scene) {
    console.log('✅ 调试对象已挂载')
    console.log('相机位置:', camera.position)
  }
}


/** 初始化第一人称相机与 OrbitControls 限制 */
function initCameraAndControls(width, height, domElement) {
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
  camera.position.copy(FIXED_CAMERA_POS)   // 使用新变量名

  controls = new OrbitControls(camera, domElement)
  controls.target.copy(FIXED_TARGET_POS)   // 使用新变量名
  controls.enableZoom = false
  controls.enablePan = false
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minAzimuthAngle = -AZIMUTH_LIMIT
  controls.maxAzimuthAngle = AZIMUTH_LIMIT
  controls.minPolarAngle = POLAR_LOCK
  controls.maxPolarAngle = POLAR_LOCK
  controls.update()

  debugMountTimeout = setTimeout(() => {
    debugMountTimeout = null
    mountDebugGlobals()
  }, 100)
}

function initScene() {
  scene = new THREE.Scene()
  scene.background = null

  ambientLight = new THREE.AmbientLight(0xffffff, AMBIENT_OFF)
  scene.add(ambientLight)

  directionalLight = new THREE.DirectionalLight(0xffffff, DIRECTIONAL_OFF)
  directionalLight.position.set(5, 10, 5)
  scene.add(directionalLight)
}

function initRenderer() {
  const el = containerRef.value
  if (!el) return

  const width = el.clientWidth
  const height = el.clientHeight

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height)
  renderer.setClearColor(0xffffff, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  el.appendChild(renderer.domElement)

  initCameraAndControls(width, height, renderer.domElement)

  resizeObserver = new ResizeObserver(() => {
    if (!containerRef.value || !camera || !renderer) return
    const w = containerRef.value.clientWidth
    const h = containerRef.value.clientHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  })
  resizeObserver.observe(el)
}

function loadModel(url) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader()
    loader.load(
      url,
      (gltf) => resolve(gltf.scene),
      (progress) => {
        if (progress.total) {
          const pct = Math.round((progress.loaded / progress.total) * 100)
          loadMessage.value = `3D 模型加载中... ${pct}%`
        }
      },
      (err) => reject(err),
    )
  })
}

async function bootstrap() {
  try {
    console.log('1. bootstrap start')
    initScene()
    console.log('2. initScene done')
    initRenderer()
    console.log('3. initRenderer done')

    // 直接用 fetch 加载模型
    const response = await fetch('https://github.com/hexingyi041222-boop/SmartHomeDevice/releases/download/v1.0/scene.glb')
    if (!response.ok) throw new Error('Network response was not ok')
    const buffer = await response.arrayBuffer()
    console.log('4. model loaded, size:', buffer.byteLength)

    const loader = new GLTFLoader()
    const gltf = await new Promise((resolve, reject) => {
      loader.parse(buffer, '', resolve, reject)
    })
    modelRoot = gltf.scene
    console.log('5. model parsed successfully')

    fitModelToView(modelRoot)
    scene.add(modelRoot)

    findLampMeshes(modelRoot)
    lampMeshes.forEach((mesh) => ensureMeshMaterial(mesh))
    setupRealDoor(modelRoot)

    mountDebugGlobals(modelRoot)

    applyLightState(props.lightOn)
    if (props.doorOpen) {
      applyDoorState(true)
    }

    loading.value = false
    animate()
  } catch (e) {
    console.error('5. ERROR:', e)
    loadError.value = '模型加载失败: ' + props.modelPath
    loading.value = false
  }
}
function animate() {
  animationId = requestAnimationFrame(animate)

  if (camera && controls) {
    // 绝对坐标（相对于场景原点）
    camera.position.copy(FIXED_CAMERA_POS);
    controls.target.copy(FIXED_TARGET_POS);
    controls.update();
  }

  renderer?.render(scene, camera);
}

watch(() => props.lightOn, applyLightState)
watch(() => props.doorOpen, applyDoorState)

onMounted(bootstrap)

onUnmounted(() => {
  cancelAnimationFrame(animationId)
  if (debugMountTimeout) {
    clearTimeout(debugMountTimeout)
    debugMountTimeout = null
  }
  delete window.__DEBUG_CAMERA__
  delete window.__DEBUG_CONTROLS__
  delete window.__DEBUG_SCENE__
  delete window.__DEBUG_MODEL__
  killDoorTween()
  controls?.dispose()
  resizeObserver?.disconnect()
  renderer?.dispose()
  if (containerRef.value && renderer?.domElement?.parentNode === containerRef.value) {
    containerRef.value.removeChild(renderer.domElement)
  }
})
</script>

<style scoped>
.house-scene {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100%;
  border-radius: 0;
  overflow: hidden;
  background: transparent;
}

.scene-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.6);
  color: #888888;
  font-size: 14px;
  z-index: 2;
}

.scene-placeholder--error {
  color: #ef4444;
}

.placeholder-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(59, 130, 246, 0.15);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
