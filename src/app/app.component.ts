import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

type Step = {
  label: string;
  title: string;
  text: string;
};

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('sceneCanvas', { static: true })
  private readonly canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly steps: Step[] = [
    {
      label: '01',
      title: 'Рулон пленки SSWRAP',
      text: 'Цветная смена стиля и прозрачная бронь для защиты кузова и стекол.',
    },
    {
      label: '02',
      title: 'Пленка раскрывается',
      text: 'Материал выходит из рулона мягкой лентой, показывая толщину и глянец.',
    },
    {
      label: '03',
      title: 'Точный отрез',
      text: 'Нужный кусок отделяется под форму зоны установки.',
    },
    {
      label: '04',
      title: 'Новая машина',
      text: 'Mercedes-Benz GLS 580 2020 — отрезанный кусок пленки летит к автомобилю.',
    },
    {
      label: '05',
      title: 'Фокус на стекле',
      text: 'Камера приближается к лобовому стеклу перед нанесением.',
    },
    {
      label: '06',
      title: 'Пленка на месте',
      text: 'Прозрачный слой ложится на стекло, сохраняя чистый вид автомобиля.',
    },
  ];

  progress = 0;
  activeStep = 0;

  // Tape dimensions (world units). The piece is sized to the real windshield.
  private readonly rollRadius = 0.5;
  private readonly tapeWidth = 1.4;
  private readonly cutDistance = 0.6;
  private readonly pieceLength = 0.6;
  private readonly segments = 48;

  // Windshield pose in the raw FBX coordinate system (cm-ish units, front is +z).
  private readonly wsBottomRaw = new THREE.Vector3(178.7, 142, -300);
  private readonly wsNormalRaw = new THREE.Vector3(0, 0.62, 0.785).normalize();

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private dispenser!: THREE.Group;
  private roll!: THREE.Group;
  private rollBody!: THREE.Mesh;
  private rollCaps: THREE.Mesh[] = [];
  private stub!: THREE.Mesh;
  private piece!: THREE.Mesh;
  private blade!: THREE.Group;
  private cutGlow!: THREE.Mesh;
  private car!: THREE.Group;
  private anchor!: THREE.Object3D;
  private pins: THREE.Group[] = [];

  private readonly tmpMat = new THREE.Matrix4();
  private readonly posA = new THREE.Vector3();
  private readonly posB = new THREE.Vector3();
  private readonly quatA = new THREE.Quaternion();
  private readonly quatB = new THREE.Quaternion();
  private readonly scaleTmp = new THREE.Vector3();
  private readonly wsCenter = new THREE.Vector3();
  private readonly wsNormal = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3();
  private readonly camTarget = new THREE.Vector3();
  private readonly camPosA = new THREE.Vector3();
  private readonly camTargetA = new THREE.Vector3();
  private animationFrame = 0;
  private time = 0;

  constructor(private readonly zone: NgZone) {}

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.initScene();
      this.onResize();
      this.updateFromScroll();
      this.renderLoop();
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animationFrame);
    this.renderer?.dispose();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.updateFromScroll();
  }

  @HostListener('window:resize')
  onResize(): void {
    if (!this.renderer || !this.camera) {
      return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private initScene(): void {
    const canvas = this.canvasRef.nativeElement;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x050608, 12, 30);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    this.camera.position.set(-1.6, 1.2, 5.5);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      canvas,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    const ambient = new THREE.AmbientLight(0x9fb7c8, 1.6);
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(4, 7, 6);
    key.castShadow = true;

    const front = new THREE.DirectionalLight(0xdff6ff, 1.6);
    front.position.set(0, 3, 9);

    const rim = new THREE.PointLight(0x66e7ff, 80, 18);
    rim.position.set(-5, 3, 4);

    this.scene.add(ambient, key, front, rim, this.createFloor());
    this.createDispenser();
    this.createCar();
  }

  private createFloor(): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(40, 40);
    const material = new THREE.MeshStandardMaterial({
      color: 0x080c10,
      roughness: 0.5,
      metalness: 0.2,
    });
    const floor = new THREE.Mesh(geometry, material);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.6;
    floor.receiveShadow = true;
    return floor;
  }

  private createCapTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const c = size / 2;
    ctx.fillStyle = '#1b2733';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(114,233,255,0.55)';
    for (let i = 0; i < 9; i++) {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c, c, 40 + i * 11, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#e9f6fb';
    ctx.beginPath();
    ctx.arc(c, c, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0d1218';
    ctx.beginPath();
    ctx.arc(c, c, 24, 0, Math.PI * 2);
    ctx.fill();
    // Spokes make the rotation readable.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * 28, c + Math.sin(a) * 28);
      ctx.lineTo(c + Math.cos(a) * 118, c + Math.sin(a) * 118);
      ctx.stroke();
    }
    return new THREE.CanvasTexture(canvas);
  }

  private createRibbon(): THREE.Mesh {
    const n = this.segments;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 1) * 2 * 3), 3));
    const index: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geometry.setIndex(index);

    const material = new THREE.MeshPhysicalMaterial({
      color: 0x72e9ff,
      transparent: true,
      opacity: 0.62,
      roughness: 0.08,
      clearcoat: 1,
      emissive: 0x0a4a5a,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    return mesh;
  }

  private createDispenser(): void {
    const { rollRadius: R, tapeWidth: W } = this;

    this.dispenser = new THREE.Group();
    this.dispenser.position.set(-2.7, 0.3, 0);
    this.dispenser.rotation.x = 0.55;
    this.scene.add(this.dispenser);

    this.roll = new THREE.Group();
    this.dispenser.add(this.roll);

    const bodyMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x3fb7cf,
      transparent: true,
      opacity: 0.85,
      roughness: 0.15,
      metalness: 0.2,
      clearcoat: 1,
    });
    this.rollBody = new THREE.Mesh(new THREE.CylinderGeometry(R, R, W, 64, 1, true), bodyMaterial);
    this.rollBody.rotation.x = Math.PI / 2;
    this.rollBody.castShadow = true;

    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, W + 0.12, 32),
      new THREE.MeshStandardMaterial({ color: 0xe9f6fb, roughness: 0.6 }),
    );
    core.rotation.x = Math.PI / 2;

    const capMaterial = new THREE.MeshStandardMaterial({ map: this.createCapTexture(), roughness: 0.4 });
    for (const side of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.CircleGeometry(R, 64), capMaterial);
      cap.position.z = (side * W) / 2;
      if (side < 0) {
        cap.rotation.y = Math.PI;
      }
      this.roll.add(cap);
      this.rollCaps.push(cap);
    }
    this.roll.add(this.rollBody, core);

    this.stub = this.createRibbon();
    this.piece = this.createRibbon();
    this.dispenser.add(this.stub);
    this.scene.add(this.piece);

    // Guillotine blade across the full tape width.
    this.blade = new THREE.Group();
    const bladeMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.5, W + 0.3),
      new THREE.MeshStandardMaterial({ color: 0xf2fbff, metalness: 0.9, roughness: 0.15 }),
    );
    const bladeEdge = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.03, W + 0.3),
      new THREE.MeshBasicMaterial({ color: 0x9df3ff }),
    );
    bladeEdge.position.y = -0.26;
    this.blade.add(bladeMesh, bladeEdge);
    this.blade.visible = false;
    this.dispenser.add(this.blade);

    this.cutGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.02, W + 0.1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
    );
    this.dispenser.add(this.cutGlow);
  }

  private createCar(): void {
    this.car = new THREE.Group();
    this.car.position.set(1.25, -1.6, 0);
    this.car.rotation.y = -0.28;
    this.car.scale.setScalar(0.02);
    this.scene.add(this.car);

    // Anchor sits at the bottom-center of the windshield. Local axes:
    // x = up the glass, y = glass normal, z = across the car.
    this.anchor = new THREE.Object3D();
    this.car.add(this.anchor);
    this.createPins();

    const loader = new FBXLoader();
    loader.load(
      'assets/models/mercedes-gls-580.fbx',
      (model) => {
        model.name = 'Mercedes-Benz GLS 580 2020';
        model.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });

        // Normalize unknown source units; car sits on y = 0 and is centered on x/z.
        model.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(model);
        const center = bounds.getCenter(new THREE.Vector3());
        const largest = Math.max(...bounds.getSize(new THREE.Vector3()).toArray()) || 1;
        const k = 6 / largest;
        model.scale.setScalar(k);
        model.position.set(-center.x * k, -bounds.min.y * k, -center.z * k);
        this.car.add(model);

        // Map the raw windshield pose into the car's local space.
        const bottom = this.wsBottomRaw.clone().multiplyScalar(k).add(model.position);
        const n = this.wsNormalRaw.clone();
        const across = new THREE.Vector3(1, 0, 0);
        const up = new THREE.Vector3().crossVectors(across, n).normalize(); // x = up-slope
        this.anchor.position.copy(bottom);
        this.anchor.quaternion.setFromRotationMatrix(this.tmpMat.makeBasis(up, n, across));
      },
      undefined,
      (error) => console.error('Unable to load Mercedes-Benz GLS 580 FBX model', error),
    );
  }

  private createPins(): void {
    const steel = new THREE.MeshStandardMaterial({ color: 0xdfe8ee, metalness: 0.9, roughness: 0.25 });
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xff3b3b, roughness: 0.3, emissive: 0x330000 });
    const half = this.tapeWidth / 2 - 0.08;
    const corners: [number, number][] = [
      [0.07, -half],
      [0.07, half],
      [this.pieceLength - 0.07, -half],
      [this.pieceLength - 0.07, half],
    ];
    for (const [x, z] of corners) {
      const pin = new THREE.Group();
      const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 8), steel);
      needle.position.y = 0.06;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), headMaterial);
      head.position.y = 0.13;
      pin.add(needle, head);
      pin.position.set(x, 0, z);
      pin.visible = false;
      this.anchor.add(pin);
      this.pins.push(pin);
    }
  }

  private updateFromScroll(): void {
    const maxScroll = Math.max(document.body.scrollHeight - window.innerHeight, 1);
    const nextProgress = Math.min(Math.max(window.scrollY / maxScroll, 0), 1);
    const nextStep = Math.min(Math.floor(nextProgress * this.steps.length), this.steps.length - 1);

    if (nextStep !== this.activeStep) {
      this.zone.run(() => {
        this.activeStep = nextStep;
        this.progress = nextProgress;
      });
    } else {
      this.progress = nextProgress;
    }

    this.targetProgress = nextProgress;
  }

  private targetProgress = 0;
  private smoothed = 0;

  /** Tape centerline height in dispenser space at distance x from the roll. */
  private tapeY(x: number, flutter: number): number {
    const ripple = Math.sin(x * 4.5 - this.time * 2.2) * 0.03 * Math.min(x / 1.2, 1) * flutter;
    return this.rollRadius - 0.07 * x * x + ripple;
  }

  private fillRibbon(mesh: THREE.Mesh, length: number, point: (a: number) => [number, number]): void {
    const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const w = this.tapeWidth / 2;
    for (let i = 0; i <= this.segments; i++) {
      const [x, y] = point((length * i) / this.segments);
      position.setXYZ(i * 2, x, y, -w);
      position.setXYZ(i * 2 + 1, x, y, w);
    }
    position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }

  private applyProgress(p: number): void {
    const { rollRadius: R, cutDistance: cutS, pieceLength: L } = this;

    const unroll = this.smoothRange(p, 0.04, 0.3);
    const bladeDown = this.smoothRange(p, 0.31, 0.37);
    const bladeUp = this.smoothRange(p, 0.39, 0.44);
    const gap = this.smoothRange(p, 0.37, 0.45);
    const carReveal = this.smoothRange(p, 0.44, 0.62);
    const ready = this.smoothRange(p, 0.46, 0.6);
    const fly = this.smoothRange(p, 0.62, 0.8);
    const settle = this.smoothRange(p, 0.78, 0.84);
    const lay = this.smoothRange(p, 0.84, 0.95);
    const pinT = this.smoothRange(p, 0.94, 1);
    const flutter = 1 - fly;

    // ---- dispenser, roll and tape
    const pulled = unroll * (cutS + L);
    this.roll.rotation.z = -pulled / R;
    this.rollBody.scale.set(1 - 0.12 * unroll, 1, 1 - 0.12 * unroll);
    this.dispenser.position.x = -2.7 - carReveal * 1.6;
    this.dispenser.position.y = 0.3 + Math.sin(this.time * 1.4) * 0.025;
    const rollOut = this.smoothRange(p, 0.6, 0.78);
    this.dispenser.visible = rollOut < 1;
    this.dispenser.scale.setScalar(1 - rollOut * 0.6);

    const stubLength = Math.min(pulled, cutS);
    this.stub.visible = stubLength > 0.001;
    this.fillRibbon(this.stub, stubLength, (x) => [x, this.tapeY(x, flutter)]);

    this.blade.visible = bladeDown > 0.001 && bladeUp < 0.999;
    this.blade.position.set(cutS + 0.01, R + 1.0 - bladeDown * 1.45 + bladeUp * 1.6, 0);
    const glow = this.cutGlow.material as THREE.MeshBasicMaterial;
    glow.opacity = Math.sin(Math.PI * this.smoothRange(p, 0.355, 0.43)) * 0.95;
    this.cutGlow.position.set(cutS, this.tapeY(cutS, 0), 0);

    // ---- cut piece: shape in its own (a, b) space, then posed in the world
    const pieceLength = Math.max(pulled - cutS, 0);
    this.piece.visible = pieceLength > 0.002;
    const baseY = this.tapeY(cutS, 0);
    const phi0 = 0.5 * settle * (1 - lay);
    const hinge = lay * L;
    this.fillRibbon(this.piece, pieceLength, (a) => {
      const droop = this.tapeY(cutS + a, flutter) - baseY;
      const bow = 0.09 * Math.sin((Math.PI * a) / L);
      let b = droop * (1 - fly) + bow * fly * (1 - settle);
      let x = a;
      if (settle > 0) {
        const d = Math.max(a - hinge, 0);
        x = Math.min(a, hinge) + d * Math.cos(phi0);
        b = b + d * Math.sin(phi0) + 0.012;
      }
      return [x, b];
    });

    // pose A: where the tape leaves the dispenser (floats up when ready)
    this.dispenser.updateMatrixWorld(true);
    this.tmpMat.makeTranslation(cutS + gap * 0.06, baseY, 0);
    this.tmpMat.premultiply(this.dispenser.matrixWorld);
    this.tmpMat.decompose(this.posA, this.quatA, this.scaleTmp);
    this.posA.y += ready * 0.45 + Math.sin(this.time * 1.8) * 0.03 * ready * (1 - fly);

    // pose B: bottom edge of the windshield, hovering until the tape settles
    this.car.updateMatrixWorld(true);
    this.anchor.updateWorldMatrix(true, false);
    this.anchor.matrixWorld.decompose(this.posB, this.quatB, this.scaleTmp);
    this.wsNormal.set(0, 1, 0).applyQuaternion(this.quatB);
    this.posB.addScaledVector(this.wsNormal, 0.5 * (1 - settle));

    // The piece's local x axis runs up the glass, so quatB already matches.
    this.piece.position.lerpVectors(this.posA, this.posB, fly);
    this.piece.position.y += Math.sin(Math.PI * fly) * 0.7;
    this.piece.quaternion.slerpQuaternions(this.quatA, this.quatB, fly);

    // ---- pins
    this.pins.forEach((pin, i) => {
      const t = this.smoothRange(pinT, i * 0.18, i * 0.18 + 0.45);
      pin.visible = t > 0.001;
      pin.position.y = (1 - t) * 0.5;
      pin.scale.setScalar(0.4 + t * 0.6);
    });

    // ---- car
    this.car.scale.setScalar(0.02 + carReveal * 0.98);
    this.car.rotation.y = -0.28 + fly * 0.16;
    this.car.visible = carReveal > 0.001;

    // ---- camera
    this.wsCenter.set(L / 2, 0, 0).applyQuaternion(this.quatB).add(this.posB).addScaledVector(this.wsNormal, -0.5 * (1 - settle));

    // start close on the roll, pull back to see the car
    const pullBack = this.smoothRange(p, 0.4, 0.6);
    this.camPosA.set(-1.9, 1.3, 5.6).lerp(new THREE.Vector3(0.2, 1.6, 9.6), pullBack);
    this.camTargetA.set(-1.9, 0.3, 0).lerp(new THREE.Vector3(0, -0.3, 0), pullBack);

    // then dive to the windshield
    const zoom = this.smoothRange(p, 0.62, 0.82);
    this.camPos.copy(this.wsCenter).addScaledVector(this.wsNormal, 3.0).add(new THREE.Vector3(0.0, -0.2, 0.3));
    this.camera.position.lerpVectors(this.camPosA, this.camPos, zoom);
    this.camTarget.copy(this.camTargetA).lerp(this.wsCenter, zoom);
    this.camera.lookAt(this.camTarget);
  }

  private renderLoop(): void {
    this.animationFrame = requestAnimationFrame(() => this.renderLoop());

    this.time = performance.now() * 0.001;
    // Ease toward the scroll position so the motion stays fluid between wheel ticks.
    this.smoothed += (this.targetProgress - this.smoothed) * 0.12;
    this.applyProgress(this.smoothed);

    this.renderer.render(this.scene, this.camera);
  }

  private smoothRange(value: number, start: number, end: number): number {
    const progress = Math.min(Math.max((value - start) / (end - start), 0), 1);
    return progress * progress * (3 - 2 * progress);
  }
}
