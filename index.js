import "./global";
import { Project, Scene3D, PhysicsLoader, THREE } from "enable3d";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import Stats from "three/examples/jsm/libs/stats.module";
import { Camera, Renderer } from "holoplay";

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

const NUM_POINTS = 1000;

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
    this.state = window.state = Object.preventExtensions({
      player: null,
      points: null,
      pointBodies: [],
    });
    // this.physics.debug.enable();
  }

  async create() {
    window.scene = this;
    const warp = await this.warpSpeed("-ground", "orbitControls", "-sky");
    this.camera.position.set(0, 0, 20);
    this.camera.rotation.set(0, 0, 0);
    //warp.orbitControls.update();
    // const volume = this.add.box({width: 3, height: 4, depth: 2});
    // volume.scale.setScalar(0.99);
    const wallThickness = 0.5;
    const halfWallThickness = wallThickness / 2;
    const doubleWallThickness = wallThickness * 2;
    this.physics.add.box({x: -1.5 - halfWallThickness, width: wallThickness, height: 4 + doubleWallThickness, depth: 2 + doubleWallThickness, collisionFlags: collisionFlags.static}, {lambert: {visible: true, wireframe: false}});
    this.physics.add.box({x: +1.5 + halfWallThickness, width: wallThickness, height: 4 + doubleWallThickness, depth: 2 + doubleWallThickness, collisionFlags: collisionFlags.static}, {lambert: {visible: true, wireframe: false}});
    this.physics.add.box({y: +2.0 + halfWallThickness, width: 3 + doubleWallThickness, height: wallThickness, depth: 2 + doubleWallThickness, collisionFlags: collisionFlags.static}, {lambert: {visible: true, wireframe: false}});
    this.physics.add.box({y: -2.0 - halfWallThickness, width: 3 + doubleWallThickness, height: wallThickness, depth: 2 + doubleWallThickness, collisionFlags: collisionFlags.static}, {lambert: {visible: true, wireframe: false}});
    this.physics.add.box({z: -1.0 - halfWallThickness, width: 3 + doubleWallThickness, height: 4 + doubleWallThickness, depth: wallThickness, collisionFlags: collisionFlags.static}, {lambert: {visible: true, wireframe: false}});
    this.physics.add.box({z: +1.0 + halfWallThickness, width: 3 + doubleWallThickness, height: 4 + doubleWallThickness, depth: wallThickness, collisionFlags: collisionFlags.static}, {lambert: {visible: false, wireframe: true}});
    this.state.player = this.physics.add.sphere({radius: 0.25}, {standard: {color: 'red'}});

    const points = new THREE.BufferGeometry();
    points.setAttribute("position", new THREE.BufferAttribute(new Float32Array(NUM_POINTS * 3), 3));
    this.state.points = points;
    this.scene.add(new THREE.Points(points, new THREE.PointsMaterial({
      size: 0.5,
      sizeAttenuation: true,
      map: this.assets.textures.sprite,
      transparent: false,
      alphaTest: 0.5,
      depthTest: true,
      blending: THREE.AdditiveBlending
    })));

    const dummyObj = new THREE.Object3D();
    let i = NUM_POINTS;
    while(i--) {
      dummyObj.hasBody = false;
      dummyObj.position.set(rand(-1, 1), rand(-1, 1), rand(-1, 1));
      this.physics.add.existing(dummyObj, {shape: "sphere", radius: 0.1, mass: 0.01});
      const body = dummyObj.body;
      body.skipUpdate = true;
      this.state.pointBodies.push(body);
    }
  }

  update = (() => {
    const transform = new Ammo.btTransform();
    return () => {
      stats.update();

      const gamepad = getGamepad(0);
      if (gamepad) {
        const ax = deadzone(gamepad.axes[0]);
        const ay = deadzone(gamepad.axes[1]);
        const by = -deadzone(gamepad.axes[3]);
        const scale = 20;
        this.state.player.body.applyCentralForce(scale * ax, scale * by, scale * ay, );
      }

      const attr = this.state.points.attributes.position;
      let i = NUM_POINTS;
      while(i--) {
        const motionState = this.state.pointBodies[i].ammo.getMotionState();
        motionState.getWorldTransform(transform);
        if (transform) {
          const origin = transform.getOrigin();
          attr.array[i * 3 + 0] = origin.x();
          attr.array[i * 3 + 1] = origin.y();
          attr.array[i * 3 + 2] = origin.z();
        }
      }
      attr.needsUpdate = true;
    };
  })();
}

const renderer = window.renderer = new Renderer({ disableFullscreenUi: queryParams.has("2d") });
renderer.renderQuilt = true;
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
