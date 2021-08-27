/*globals Ammo, Leap */
import "./global";
import { Project, Scene3D, PhysicsLoader, THREE } from "enable3d";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import Stats from "three/examples/jsm/libs/stats.module";
import { Camera, Renderer } from "holoplay";
import "leapjs/leap-1.1.1";

const queryParams = new URLSearchParams(location.search);

function map(v, a, b, c, d) {
  return ((v - a) / (b - a)) * (d - c) + c;
}

function deadzone(v, z = 0.1) {
  const s = Math.sign(v);
  const av = Math.abs(v);
  v = av < z ? z : av;
  return s * map(v, z, 1, 0, 1);
}

function rand(min, max) {
  if (max === undefined) {
    max = min;
    min = 0;
  }
  return Math.random() * (max - min) + min;
}

const collisionFlags = {
  dynamic: 0,
  static: 1,
  kinematic: 2,
  ghost: 4,
};

const loadTexture = (() => {
  const textureLoader = new THREE.TextureLoader();
  return (texture) => {
    return textureLoader.load(texture);
  };
})();

// eslint-disable-next-line no-unused-vars
const loadModel = (() => {
  const gltfLoader = new GLTFLoader();
  return (model) => {
    return new Promise((resolve) => {
      gltfLoader.load(model, (gltf) => {
        if (gltf.animations?.length) {
          const mixer = new THREE.AnimationMixer(gltf.scene);
          gltf.scene.userData.mixer = mixer;
          gltf.scene.userData.action = mixer.clipAction(gltf.animations[0]);
        }
        resolve(gltf.scene);
      });
    });
  };
})();

function getGamepad(i) {
  const gamepads = navigator.getGamepads();
  if (gamepads.length && gamepads[i]) return gamepads[i];
}

const stats = new Stats();
document.body.append(stats.dom);

const NUM_POINTS = 500;

class MainScene extends Scene3D {
  async preload() {
    this.assets = {
      textures: {
        sprite: await loadTexture("sprite.png"),
      },
      models: {
      },
    };
  }

  async init() {
    this.renderer.physicallyCorrectLights = true;
    this.state = window.state = Object.preventExtensions({
      player: null,
      points: null,
      pointBodies: [],
      color: new THREE.Color('red'),
      light: null,
      palmPosition: null,
      grabStrength: null,
      keys: {
        KeyW: false,
        KeyS: false,
        KeyA: false,
        KeyD: false,
        KeyR: false,
        KeyF: false,
      },
    });
    // this.physics.debug.enable();
  }

  async create() {
    window.scene = this;
    // const warp = await this.warpSpeed("-ground", "-light", "orbitControls", "-sky");
    this.camera.position.set(0, 0, 20);
    this.camera.rotation.set(0, 0, 0);
    //warp.orbitControls.update();

    const rectLight = new THREE.RectAreaLight('white', 0.3, 3, 4)
    rectLight.position.z = 1.5;
    this.scene.add(rectLight);

    //this.scene.add(new THREE.AmbientLight('white', 0.2));

    // const volume = this.add.box({width: 3, height: 4, depth: 2});
    // volume.scale.setScalar(0.99);
    
    const wallThickness = 0.5;
    const halfWallThickness = wallThickness / 2;
    const overlap = wallThickness * 2;
    let wall;
    wall = this.physics.add.box({x: -1.5 - halfWallThickness, width: wallThickness, height: 4 + overlap, depth: 2 + overlap, collisionFlags: collisionFlags.static}, {standard: {roughness: 1.0, metalness: 0, visible: true, wireframe: false}});
    wall.receiveShadow = true;
    wall.castShadow = false;
    wall = this.physics.add.box({x: +1.5 + halfWallThickness, width: wallThickness, height: 4 + overlap, depth: 2 + overlap, collisionFlags: collisionFlags.static}, {standard: {roughness: 1.0, metalness: 0, visible: true, wireframe: false}});
    wall.receiveShadow = true;
    wall.castShadow = false;
    wall = this.physics.add.box({y: +2.0 + halfWallThickness, width: 3 + overlap, height: wallThickness, depth: 2 + overlap, collisionFlags: collisionFlags.static}, {standard: {roughness: 1.0, metalness: 0, visible: true, wireframe: false}});
    wall.receiveShadow = true;
    wall.castShadow = false;
    wall = this.physics.add.box({y: -2.0 - halfWallThickness, width: 3 + overlap, height: wallThickness, depth: 2 + overlap, collisionFlags: collisionFlags.static}, {standard: {roughness: 1.0, metalness: 0, visible: true, wireframe: false}});
    wall.receiveShadow = true;
    wall.castShadow = false;
    wall = this.physics.add.box({z: -1.0 - halfWallThickness, width: 3 + overlap, height: 4 + overlap, depth: wallThickness, collisionFlags: collisionFlags.static}, {standard: {roughness: 1.0, metalness: 0, visible: true, wireframe: false}});
    wall.receiveShadow = true;
    wall.castShadow = false;
    wall = this.physics.add.box({z: +1.0 + halfWallThickness, width: 3 + overlap, height: 4 + overlap, depth: wallThickness, collisionFlags: collisionFlags.static}, {standard: {roughness: 1.0, metalness: 0, visible: false, wireframe: true}});
    wall.receiveShadow = false;
    wall.castShadow = false;

    this.state.player = this.physics.add.sphere({radius: 0.25, widthSegments: 64, heightSegments: 32}, {standard: {emissive: 'red', emissiveIntensity: 0.9, color: 'red', metalness: 0, roughness: 1}});
    const pointLight = new THREE.PointLight('red', 1, 0, 2);
    pointLight.castShadow = true;
    pointLight.shadow.radius = 10;
    pointLight.shadow.mapSize.setScalar(1024);
    this.state.player.add(pointLight);
    this.state.light = pointLight;

    const pointSize = 0.12
    const points = new THREE.InstancedMesh(new THREE.SphereGeometry(pointSize, 32, 16), new THREE.MeshStandardMaterial({metalness: 0.0, roughness: 0.2}), NUM_POINTS);
    points.castShadow= true;
    points.receiveShadow= true;
    this.scene.add(points);
    this.state.points = points;

    const dummyObj = new THREE.Object3D();
    let i = NUM_POINTS;
    while(i--) {
      dummyObj.hasBody = false;
      dummyObj.position.set(rand(-1, 1), rand(-1, 1), rand(-1, 1));
      this.physics.add.existing(dummyObj, {shape: "sphere", radius: pointSize, mass: 0.1});
      const body = dummyObj.body;
      body.skipUpdate = true;
      this.state.pointBodies.push(body);
    }

    Leap.loop(frame => {
      if (frame.hands.length && frame.hands[0].valid) {
        this.state.player.body.setCollisionFlags(collisionFlags.kinematic);
        this.state.palmPosition = frame.hands[0].palmPosition;
        this.state.grabStrength = frame.hands[0].grabStrength;
      } else {
        this.state.palmPosition = null;
        this.state.grabStrength = null;
      }
    });

    const validKeys = Object.keys(this.state.keys);
    window.addEventListener("keydown", e => {
      if (!validKeys.includes(e.code)) return;
      this.state.keys[e.code] = true;
    });
    window.addEventListener("keyup", e => {
      if (!validKeys.includes(e.code)) return;
      this.state.keys[e.code] = false;
    });
  }

  update = (() => {
    const transform = new Ammo.btTransform();
    const matrix = new THREE.Matrix4();
    const leapScale = 1/50;
    const leapOffset = [0, -5, 0];
    const vec = new THREE.Vector3();
    return (time, delta) => {
      stats.update();

      const deltaSecs = delta / 1000;

      if (this.state.palmPosition) {
        const [x, y, z] = this.state.palmPosition;
        this.state.player.position.set(
          x * leapScale + leapOffset[0],
          y * leapScale + leapOffset[1],
          z * leapScale + leapOffset[2],
        );
        this.state.player.body.needUpdate = true;
      } else {
        const gamepad = getGamepad(0);
        const scale = 20;
        if (gamepad) {
          const ax = deadzone(gamepad.axes[0]);
          const ay = deadzone(gamepad.axes[1]);
          const by = -deadzone(gamepad.axes[3]);
          this.state.player.body.applyCentralForce(scale * ax, scale * by, scale * ay);
        } else {
          const ax = this.state.keys.KeyA ? -1 : this.state.keys.KeyD ? 1 : 0;
          const ay = this.state.keys.KeyS ? 1 : this.state.keys.KeyW ? -1 : 0;
          const by = this.state.keys.KeyF ? -1 : this.state.keys.KeyR ? 1 : 0;
          this.state.player.body.applyCentralForce(scale * ax, scale * by, scale * ay);
        }
      }

      let i = NUM_POINTS;
      while(i--) {
        const motionState = this.state.pointBodies[i].ammo.getMotionState();
        motionState.getWorldTransform(transform);
        const origin = transform.getOrigin();
        matrix.makeTranslation(origin.x(), origin.y(), origin.z());
        this.state.points.setMatrixAt(i, matrix);

        const grabStrength = this.state.grabStrength;
        const repel = 0.1;
        const attract = 0.9;
        if (grabStrength !== null && (grabStrength < repel || grabStrength > attract)) {
          vec.set(origin.x(), origin.y(), origin.z());
          vec.sub(this.state.player.position);
          vec.normalize();
          if (this.state.grabStrength > attract) {
            vec.multiplyScalar(map(this.state.grabStrength, attract, 1, 0, -0.5));
          } else if(this.state.grabStrength < repel) {
            vec.multiplyScalar(map(this.state.grabStrength, repel, 0, 0, 0.5));
          } 
          this.state.pointBodies[i].applyCentralForce(vec.x, vec.y, vec.z);
        }
      }
      this.state.points.instanceMatrix.needsUpdate = true;

      this.state.color.offsetHSL(0.1 * deltaSecs, 0, 0);
      this.state.player.material.color.copy(this.state.color);
      this.state.player.material.emissive.copy(this.state.color);
      this.state.light.color.copy(this.state.color);
    };
  })();
}

const renderer = window.renderer = new Renderer({ disableFullscreenUi: queryParams.has("2d") });
//renderer.renderQuilt = true;
renderer.render2d = queryParams.has("2d");
renderer.setSize = (width, height) => {
  return renderer.webglRenderer.setSize(width, height);
};
renderer.setPixelRatio = (ratio) => {
  return renderer.webglRenderer.setPixelRatio(ratio);
};
renderer.setAnimationLoop = (func) => {
  return renderer.webglRenderer.setAnimationLoop(func);
};
renderer.compile = (a, b) => {
  return renderer.webglRenderer.compile(a, b);
};
renderer.getClearColor = (a) => {
  return renderer.webglRenderer.getClearColor(a);
};
renderer.getRenderTarget = () => {
  return renderer.webglRenderer.getRenderTarget();
};
renderer.setRenderTarget = (a, b, c) => {
  return renderer.webglRenderer.setRenderTarget(a, b, c);
};
Object.defineProperty(renderer, "shadowMap", {
  get() {
    return renderer.webglRenderer.shadowMap;
  },
});

const camera = window.camera = new Camera();

PhysicsLoader(
  "lib",
  () =>
    new Project({
      renderer,
      camera,
      // gravity: { x: 0, y: -9.8, z: 0 },
      gravity: { x: 0, y: 0, z: 0 },
      scenes: [MainScene],
    })
);
