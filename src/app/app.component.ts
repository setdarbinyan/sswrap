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
      text: 'Показываем современный семейный SUV без привязки к брендам и логотипам.',
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

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private roll!: THREE.Group;
  private film!: THREE.Mesh;
  private cutPiece!: THREE.Mesh;
  private blade!: THREE.Mesh;
  private car!: THREE.Group;
  private windshieldFilm!: THREE.Mesh;
  private readonly windshieldFilmBase = new THREE.Vector3();
  private readonly windshieldAnchor = new THREE.Vector3();
  private readonly cameraTarget = new THREE.Vector3();
  private readonly zoomTarget = new THREE.Vector3();
  private animationFrame = 0;

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
    this.scene.fog = new THREE.Fog(0x050608, 9, 24);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    this.camera.position.set(0, 2.5, 11);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      canvas,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    const ambient = new THREE.AmbientLight(0x9fb7c8, 1.5);
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(4, 7, 6);
    key.castShadow = true;

    const rim = new THREE.PointLight(0x66e7ff, 80, 18);
    rim.position.set(-5, 3, 4);

    this.scene.add(ambient, key, rim, this.createFloor());
    this.createFilmRoll();
    this.createCar();
  }

  private createFloor(): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(28, 28);
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

  private createFilmRoll(): void {
    this.roll = new THREE.Group();

    const rollMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x111923,
      roughness: 0.25,
      metalness: 0.45,
      clearcoat: 1,
    });
    const sideMaterial = new THREE.MeshStandardMaterial({ color: 0xeef6fb, roughness: 0.2 });
    const coreMaterial = new THREE.MeshStandardMaterial({ color: 0x12171d, roughness: 0.35 });

    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 3.4, 72), rollMaterial);
    cylinder.rotation.z = Math.PI / 2;
    cylinder.castShadow = true;

    const leftCap = new THREE.Mesh(new THREE.CylinderGeometry(1.47, 1.47, 0.08, 72), sideMaterial);
    leftCap.rotation.z = Math.PI / 2;
    leftCap.position.x = -1.74;

    const rightCap = leftCap.clone();
    rightCap.position.x = 1.74;

    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 3.55, 48), coreMaterial);
    core.rotation.z = Math.PI / 2;

    this.roll.add(cylinder, leftCap, rightCap, core);
    this.roll.position.set(-2.8, 0.45, 0);
    this.scene.add(this.roll);

    const filmGeometry = new THREE.PlaneGeometry(1, 2.75, 1, 1);
    const filmMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x72e9ff,
      transparent: true,
      opacity: 0.42,
      roughness: 0.08,
      metalness: 0,
      clearcoat: 1,
      side: THREE.DoubleSide,
    });

    this.film = new THREE.Mesh(filmGeometry, filmMaterial);
    this.film.rotation.x = -0.14;
    this.film.position.set(-1.15, 0.44, 0);
    this.film.scale.x = 0.02;
    this.scene.add(this.film);

    this.cutPiece = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 2.55), filmMaterial.clone());
    this.cutPiece.position.set(1.4, 0.45, 0.04);
    this.cutPiece.rotation.x = -0.14;
    this.cutPiece.visible = false;
    this.scene.add(this.cutPiece);

    const bladeMaterial = new THREE.MeshStandardMaterial({
      color: 0xf2fbff,
      metalness: 0.8,
      roughness: 0.2,
    });
    this.blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.3, 0.08), bladeMaterial);
    this.blade.position.set(0.6, 2.1, 0.18);
    this.blade.visible = false;
    this.scene.add(this.blade);
  }

  private createCar(): void {
    this.car = new THREE.Group();

    const bodyMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xe9eef1,
      roughness: 0.22,
      metalness: 0.45,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    });
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x0b1a24,
      transparent: true,
      opacity: 0.86,
      roughness: 0.04,
      metalness: 0.2,
      clearcoat: 1,
      side: THREE.DoubleSide,
    });
    const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x0a0d11, roughness: 0.38, metalness: 0.3 });
    const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.85 });
    const rimMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 0.28, metalness: 0.9 });
    const headlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8fbff,
      emissive: 0x9ff0ff,
      emissiveIntensity: 2.2,
    });
    const taillightMaterial = new THREE.MeshStandardMaterial({
      color: 0xff3b3b,
      emissive: 0xff1f2e,
      emissiveIntensity: 1.8,
    });

    // Side profiles: front of the car points to -X, ground contact at y = -1.6.
    const wheelRadius = 0.46;
    const wheelY = -1.14;
    const wheelX = [-1.95, 1.95];
    const archRadius = 0.56;

    const lowerShape = new THREE.Shape();
    lowerShape.moveTo(2.8, wheelY);
    lowerShape.lineTo(wheelX[1] + archRadius, wheelY);
    lowerShape.absarc(wheelX[1], wheelY, archRadius, 0, Math.PI, false);
    lowerShape.lineTo(wheelX[0] + archRadius, wheelY);
    lowerShape.absarc(wheelX[0], wheelY, archRadius, 0, Math.PI, false);
    lowerShape.lineTo(-2.8, wheelY);
    lowerShape.quadraticCurveTo(-2.98, wheelY, -2.98, -0.92);
    lowerShape.lineTo(-2.98, -0.46);
    lowerShape.quadraticCurveTo(-2.97, -0.26, -2.78, -0.22);
    lowerShape.lineTo(-1.72, -0.04);
    lowerShape.lineTo(2.9, 0.02);
    lowerShape.lineTo(2.96, -0.2);
    lowerShape.lineTo(2.96, -0.92);
    lowerShape.quadraticCurveTo(2.96, wheelY, 2.8, wheelY);

    const lower = new THREE.Mesh(this.extrudeProfile(lowerShape, 2.2, 0.06), bodyMaterial);
    lower.castShadow = true;

    // Greenhouse: raked windshield, long flat roof, near-vertical tailgate.
    const aPillarBase = new THREE.Vector2(-1.72, -0.04);
    const aPillarTop = new THREE.Vector2(-0.82, 0.74);

    const cabinShape = new THREE.Shape();
    cabinShape.moveTo(aPillarBase.x, aPillarBase.y);
    cabinShape.lineTo(aPillarTop.x, aPillarTop.y);
    cabinShape.quadraticCurveTo(-0.62, 0.8, -0.3, 0.8);
    cabinShape.lineTo(2.5, 0.79);
    cabinShape.quadraticCurveTo(2.78, 0.78, 2.84, 0.6);
    cabinShape.lineTo(2.9, 0.02);
    cabinShape.lineTo(aPillarBase.x, aPillarBase.y);

    const cabinWidth = 1.96;
    const cabinBevel = 0.05;
    const cabin = new THREE.Mesh(this.extrudeProfile(cabinShape, cabinWidth, cabinBevel), bodyMaterial);
    cabin.castShadow = true;

    // Windshield plane aligned with the A-pillar rake.
    const rake = aPillarTop.clone().sub(aPillarBase);
    const rakeLength = rake.length();
    const along = new THREE.Vector3(rake.x, rake.y, 0).normalize();
    const outward = new THREE.Vector3(-along.y, along.x, 0);
    const windshieldQuat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), along, outward),
    );
    const windshieldCenter = new THREE.Vector3(
      (aPillarBase.x + aPillarTop.x) / 2,
      (aPillarBase.y + aPillarTop.y) / 2,
      0,
    ).addScaledVector(outward, cabinBevel + 0.012);

    const windshield = new THREE.Mesh(
      new THREE.PlaneGeometry(cabinWidth - 0.08, rakeLength - 0.12),
      glassMaterial,
    );
    windshield.position.copy(windshieldCenter);
    windshield.quaternion.copy(windshieldQuat);

    // Daylight opening on both sides, split by black B/C pillars.
    const windowShape = new THREE.Shape();
    windowShape.moveTo(-1.5, 0.08);
    windowShape.lineTo(-0.82, 0.66);
    windowShape.quadraticCurveTo(-0.66, 0.7, -0.4, 0.7);
    windowShape.lineTo(2.42, 0.69);
    windowShape.quadraticCurveTo(2.64, 0.68, 2.7, 0.52);
    windowShape.lineTo(2.74, 0.08);
    windowShape.lineTo(-1.5, 0.08);
    const windowGeometry = new THREE.ShapeGeometry(windowShape, 12);
    const sideZ = cabinWidth / 2 + cabinBevel + 0.006;

    const sideDetails: THREE.Object3D[] = [];
    for (const side of [1, -1]) {
      const glass = new THREE.Mesh(windowGeometry, glassMaterial);
      glass.position.z = side * sideZ;
      sideDetails.push(glass);

      for (const pillarX of [0.42, 1.62]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.64, 0.012), trimMaterial);
        pillar.position.set(pillarX, 0.39, side * (sideZ + 0.004));
        sideDetails.push(pillar);
      }

      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.22), bodyMaterial);
      mirror.position.set(-1.38, 0.12, side * (sideZ + 0.12));
      mirror.castShadow = true;
      sideDetails.push(mirror);

      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.05, 0.06), trimMaterial);
      rail.position.set(1.05, 0.87, side * 0.82);
      sideDetails.push(rail);

      const cladding = new THREE.Mesh(new THREE.BoxGeometry(2.72, 0.12, 0.03), trimMaterial);
      cladding.position.set(0, -1.08, side * 1.17);
      sideDetails.push(cladding);
    }

    // Signature full-width front light bar and rear light strip.
    const headlightBar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 2.1), headlightMaterial);
    headlightBar.position.set(-2.995, -0.4, 0);

    const lowerIntake = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 1.3), trimMaterial);
    lowerIntake.position.set(-2.995, -0.88, 0);

    const taillightBar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 2.12), taillightMaterial);
    taillightBar.position.set(2.985, -0.14, 0);

    const rearGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.5), glassMaterial);
    rearGlass.position.set(2.94, 0.42, 0);
    rearGlass.rotation.y = Math.PI / 2;
    rearGlass.rotation.x = -0.1;

    this.windshieldFilm = new THREE.Mesh(
      new THREE.PlaneGeometry(cabinWidth - 0.02, rakeLength - 0.06),
      new THREE.MeshPhysicalMaterial({
        color: 0x9df3ff,
        transparent: true,
        opacity: 0,
        roughness: 0.02,
        metalness: 0,
        clearcoat: 1,
        side: THREE.DoubleSide,
      }),
    );
    this.windshieldFilmBase.copy(windshieldCenter).addScaledVector(outward, 0.01);
    this.windshieldFilm.position.copy(this.windshieldFilmBase);
    this.windshieldFilm.quaternion.copy(windshieldQuat);
    this.windshieldAnchor.copy(windshieldCenter);

    const tireGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.3, 40);
    const rimGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.02, 32);
    const spokeGeometry = new THREE.BoxGeometry(0.05, 0.52, 0.02);
    const wheels = wheelX.flatMap((x) =>
      [1, -1].map((side) => {
        const wheel = new THREE.Group();

        const tire = new THREE.Mesh(tireGeometry, tireMaterial);
        tire.rotation.x = Math.PI / 2;
        tire.castShadow = true;

        const rim = new THREE.Mesh(rimGeometry, rimMaterial);
        rim.rotation.x = Math.PI / 2;
        rim.position.z = side * 0.15;

        wheel.add(tire, rim);
        for (let i = 0; i < 5; i += 1) {
          const spoke = new THREE.Mesh(spokeGeometry, trimMaterial);
          spoke.rotation.z = (i / 5) * Math.PI;
          spoke.position.z = side * 0.162;
          wheel.add(spoke);
        }

        wheel.position.set(x, wheelY, side * 1.0);
        return wheel;
      }),
    );

    this.car.add(
      lower,
      cabin,
      windshield,
      rearGlass,
      headlightBar,
      lowerIntake,
      taillightBar,
      this.windshieldFilm,
      ...sideDetails,
      ...wheels,
    );
    this.car.position.set(1.25, -0.08, 0);
    this.car.rotation.y = -0.28;
    this.car.scale.setScalar(0.02);
    this.scene.add(this.car);
  }

  private extrudeProfile(shape: THREE.Shape, width: number, bevel: number): THREE.ExtrudeGeometry {
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: width,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 4,
      curveSegments: 24,
    });
    geometry.translate(0, 0, -width / 2);
    return geometry;
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

    this.applyProgress(nextProgress);
  }

  private applyProgress(progress: number): void {
    const filmOpen = this.smoothRange(progress, 0.12, 0.34);
    const cut = this.smoothRange(progress, 0.32, 0.48);
    const carReveal = this.smoothRange(progress, 0.48, 0.64);
    const zoom = this.smoothRange(progress, 0.66, 0.83);
    const apply = this.smoothRange(progress, 0.82, 1);

    this.roll.rotation.x = progress * Math.PI * 3.2;
    this.roll.position.x = -2.8 - carReveal * 2.8;
    this.roll.scale.setScalar(1 - carReveal * 0.35);
    this.roll.visible = progress < 0.74;

    this.film.scale.x = 0.02 + filmOpen * 4.1;
    this.film.position.x = -1.15 + filmOpen * 1.85 - carReveal * 2.6;
    this.film.position.y = 0.44 - cut * 0.08;
    this.film.visible = progress < 0.72;

    this.blade.visible = cut > 0.02 && cut < 0.96;
    this.blade.position.y = 2.1 - cut * 3.25;

    // The cut piece shrinks and fades out as the car appears instead of lingering behind it.
    this.cutPiece.visible = cut > 0.18 && carReveal < 0.98;
    this.cutPiece.position.x = 0.45 + cut * 1.9 + carReveal * 0.8;
    this.cutPiece.position.y = 0.45 + carReveal * 0.45;
    this.cutPiece.position.z = 0.04 + carReveal * 0.52;
    this.cutPiece.rotation.y = carReveal * -0.5;
    this.cutPiece.scale.setScalar(1 - carReveal * 0.7);
    (this.cutPiece.material as THREE.MeshPhysicalMaterial).opacity = 0.42 * (1 - carReveal);

    const carScale = 0.02 + carReveal * 0.98;
    this.car.scale.setScalar(carScale);
    this.car.position.x = 1.25 - zoom * 0.45;
    this.car.rotation.y = -0.28 + zoom * 0.5;

    // Zoom toward the real windshield position in world space.
    this.car.updateMatrixWorld();
    this.zoomTarget.copy(this.windshieldAnchor).applyMatrix4(this.car.matrixWorld);
    this.cameraTarget.set(-1.55, -0.05, 0).lerp(this.zoomTarget, zoom);

    this.camera.position.set(
      THREE.MathUtils.lerp(0, this.zoomTarget.x - 3.0, zoom),
      THREE.MathUtils.lerp(2.5, this.zoomTarget.y + 1.2, zoom),
      THREE.MathUtils.lerp(11, this.zoomTarget.z + 4.0, zoom),
    );
    this.camera.lookAt(this.cameraTarget);

    const material = this.windshieldFilm.material as THREE.MeshPhysicalMaterial;
    material.opacity = apply * 0.55;
    this.windshieldFilm.position.x = this.windshieldFilmBase.x - (1 - apply) * 1.25;
    this.windshieldFilm.position.y = this.windshieldFilmBase.y + (1 - apply) * 0.24;
  }

  private renderLoop(): void {
    this.animationFrame = requestAnimationFrame(() => this.renderLoop());

    const time = performance.now() * 0.001;
    this.roll.position.y = 0.45 + Math.sin(time * 1.4) * 0.025;
    this.car.position.y = -0.08 + Math.sin(time * 0.9) * 0.015;

    this.renderer.render(this.scene, this.camera);
  }

  private smoothRange(value: number, start: number, end: number): number {
    const progress = Math.min(Math.max((value - start) / (end - start), 0), 1);
    return progress * progress * (3 - 2 * progress);
  }
}
