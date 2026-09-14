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
      text: 'Показываем современный SUV в стиле Li Auto без привязки к логотипам.',
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
    this.renderer.dispose();
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
      color: 0xf4f7f8,
      roughness: 0.18,
      metalness: 0.35,
      clearcoat: 1,
    });
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x0f2534,
      transparent: true,
      opacity: 0.72,
      roughness: 0.03,
      metalness: 0,
      clearcoat: 1,
    });
    const blackMaterial = new THREE.MeshStandardMaterial({ color: 0x06090d, roughness: 0.42 });
    const lightMaterial = new THREE.MeshStandardMaterial({
      color: 0xbff5ff,
      emissive: 0x64e3ff,
      emissiveIntensity: 1.7,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(5.8, 1.05, 2.35), bodyMaterial);
    body.position.y = -0.62;
    body.castShadow = true;

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.9, 1.18, 2.08), bodyMaterial);
    cabin.position.set(-0.35, 0.06, 0);
    cabin.scale.set(1, 1, 0.95);
    cabin.castShadow = true;

    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.18), glassMaterial);
    windshield.position.set(-2.02, 0.26, 0);
    windshield.rotation.y = Math.PI / 2;
    windshield.rotation.z = -0.08;

    const sideGlass = new THREE.Mesh(new THREE.PlaneGeometry(2.25, 0.78), glassMaterial);
    sideGlass.position.set(-0.35, 0.24, 1.08);

    const sideGlassRight = sideGlass.clone();
    sideGlassRight.position.z = -1.08;
    sideGlassRight.rotation.y = Math.PI;

    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.38, 1.45), blackMaterial);
    grille.position.set(-2.95, -0.58, 0);

    const lightBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.72), lightMaterial);
    lightBar.position.set(-3, -0.18, 0);

    this.windshieldFilm = new THREE.Mesh(
      new THREE.PlaneGeometry(1.84, 1.24),
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
    this.windshieldFilm.position.set(-2.045, 0.27, 0);
    this.windshieldFilm.rotation.copy(windshield.rotation);

    const wheelPositions = [
      [-2.05, -1.18, 1.18],
      [2.05, -1.18, 1.18],
      [-2.05, -1.18, -1.18],
      [2.05, -1.18, -1.18],
    ] as const;

    const wheels = wheelPositions.map(([x, y, z]) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.34, 36), blackMaterial);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, y, z);
      wheel.castShadow = true;
      return wheel;
    });

    this.car.add(
      body,
      cabin,
      windshield,
      sideGlass,
      sideGlassRight,
      grille,
      lightBar,
      this.windshieldFilm,
      ...wheels,
    );
    this.car.position.set(1.25, -0.08, 0);
    this.car.rotation.y = -0.28;
    this.car.scale.setScalar(0.02);
    this.scene.add(this.car);
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

    this.cutPiece.visible = cut > 0.18 && progress < 0.86;
    this.cutPiece.position.x = 0.45 + cut * 1.9 + carReveal * 0.8;
    this.cutPiece.position.y = 0.45 + carReveal * 0.45;
    this.cutPiece.position.z = 0.04 + carReveal * 0.52;
    this.cutPiece.rotation.y = carReveal * -0.5;

    const carScale = 0.02 + carReveal * 0.98;
    this.car.scale.setScalar(carScale);
    this.car.position.x = 1.25 - zoom * 0.45;
    this.car.rotation.y = -0.28 + zoom * 0.35;

    this.camera.position.x = -zoom * 1.85;
    this.camera.position.y = 2.5 - zoom * 1.25;
    this.camera.position.z = 11 - zoom * 6.9;
    this.camera.lookAt(new THREE.Vector3(-1.55 - zoom * 0.7, -0.05 + zoom * 0.35, 0));

    const material = this.windshieldFilm.material as THREE.MeshPhysicalMaterial;
    material.opacity = apply * 0.55;
    this.windshieldFilm.position.x = -2.045 - (1 - apply) * 1.25;
    this.windshieldFilm.position.y = 0.27 + (1 - apply) * 0.24;
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
