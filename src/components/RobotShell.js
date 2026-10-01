import * as THREE from 'three';

/**
 * RobotShell.js
 * 
 * Accurately models the exact futuristic cyan/teal humanoid service robot from
 * the multi-angle reference board and 3D render:
 * 
 * - Aerodynamic molded helmet with teardrop obsidian glossy visor & circular ear pods
 * - Segmented dark charcoal cervical column with ribbed rings
 * - Smooth continuous sculpted breastplate (cuirass) with central peak and curved clavicle bridge
 * - Dark charcoal flexible midriff core with zero gaps
 * - Sculpted curved cyan abdominal belt plate
 * - Sculpted cyan pelvic hip casing
 * - Articulated mechanical shoulders & elbows with dark spherical/cylinder joints
 * - Contoured cyan bicep & forearm armor sleeves with charcoal wrist cuffs
 * - Enlarged articulated robotic hands with 5 individual dorsal plates
 * - 5 fully articulated fingers with visible mechanical knuckle hinges and rounded capsule fingertips
 * 
 * Bound directly to the MakeHuman/Sanket skeleton to preserve 100% of all 5 ISL animations.
 */

export function createRobotMaterials() {
  // Vibrant high-spec cyan/teal composite body (matching reference image)
  const cyanMetallic = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#0ed8e2'),
    metalness: 0.26,
    roughness: 0.18,
    envMapIntensity: 1.6
  });

  // Darker cyan for recessed accents & interior chamfers
  const cyanDark = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#009ba6'),
    metalness: 0.35,
    roughness: 0.28
  });

  // Glowing cyan accent rings for ear pods
  const cyanGlow = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#24f5ff'),
    emissive: new THREE.Color('#00e5ff'),
    emissiveIntensity: 2.5,
    roughness: 0.1,
    metalness: 0.1
  });

  // Dark charcoal satin/matte for mechanical joints, neck rings, and flexible midriff
  const darkCharcoal = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#14171d'),
    metalness: 0.32,
    roughness: 0.42
  });

  // Deep graphite for knuckle pivots, wrist cuffs, and disc centers
  const darkJoint = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#0c0f14'),
    metalness: 0.55,
    roughness: 0.28
  });

  // Obsidian glossy visor faceplate (matching reference Close-up Head front & side)
  const visorDark = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#06090e'),
    metalness: 0.95,
    roughness: 0.06,
    envMapIntensity: 2.2
  });

  return {
    cyanMetallic,
    cyanDark,
    cyanGlow,
    darkCharcoal,
    darkJoint,
    visorDark
  };
}

// ----------------------------------------------------
// Sculpted Procedural Geometries (No primitive boxy appearance)
// ----------------------------------------------------

function createHelmetGeometry() {
  const geo = new THREE.SphereGeometry(0.38, 48, 40);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const normY = v.y / 0.38;
    // Taper width towards chin
    if (normY < 0.2) {
      const taper = 1.0 + (normY - 0.2) * 0.35;
      v.x *= Math.max(0.60, taper);
      v.z *= Math.max(0.70, 1.0 + (normY - 0.2) * 0.20);
    }
    // Aerodynamic crown: slightly taller and narrower
    v.y *= 1.18;
    v.x *= 0.88;
    v.z *= 1.04;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function createVisorGeometry() {
  const geo = new THREE.SphereGeometry(0.36, 40, 36, -Math.PI * 0.38, Math.PI * 0.76, Math.PI * 0.12, Math.PI * 0.74);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const normY = v.y / 0.36;
    // Teardrop shield profile: widest at eye/cheek level, tapered at chin and brow
    const factor = Math.max(0.25, 1.0 - Math.pow(normY - 0.12, 2) * 1.6);
    v.x *= factor * 0.82;
    v.y *= 1.16;
    v.z *= 1.14;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function createBreastplateGeometry(w = 1.08, h = 0.58, d = 0.46) {
  const shape = new THREE.Shape();
  // Smooth breastplate outline matching reference Close-up Torso
  shape.moveTo(0, h * 0.44);
  shape.bezierCurveTo(w * 0.25, h * 0.48, w * 0.46, h * 0.45, w * 0.56, h * 0.38);
  shape.bezierCurveTo(w * 0.58, h * 0.12, w * 0.50, -h * 0.12, w * 0.44, -h * 0.28);
  shape.bezierCurveTo(w * 0.28, -h * 0.38, w * 0.14, -h * 0.48, 0, -h * 0.54);
  shape.bezierCurveTo(-w * 0.14, -h * 0.48, -w * 0.28, -h * 0.38, -w * 0.44, -h * 0.28);
  shape.bezierCurveTo(-w * 0.50, -h * 0.12, -w * 0.58, h * 0.12, -w * 0.56, h * 0.38);
  shape.bezierCurveTo(-w * 0.46, h * 0.45, -w * 0.25, h * 0.48, 0, h * 0.44);

  const extrudeSettings = {
    depth: d * 0.22,
    bevelEnabled: true,
    bevelSegments: 8,
    steps: 1,
    bevelSize: 0.05,
    bevelThickness: 0.05
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Wrap around ribcage cylinder
    const curveZ = -Math.pow(v.x / (w * 0.58), 2) * (d * 0.42);
    // Subtle vertical center peak/ridge
    const peakZ = Math.max(0, 1.0 - Math.abs(v.x) / (w * 0.32)) * 0.045;
    pos.setXYZ(i, v.x, v.y, v.z + curveZ + peakZ);
  }
  geo.computeVertexNormals();
  return geo;
}

function createAbdominalBandGeometry(w = 0.94, h = 0.44, d = 0.42) {
  const shape = new THREE.Shape();
  shape.moveTo(0, h * 0.44);
  shape.bezierCurveTo(w * 0.25, h * 0.46, w * 0.44, h * 0.40, w * 0.50, h * 0.26);
  shape.bezierCurveTo(w * 0.52, 0, w * 0.50, -h * 0.26, w * 0.46, -h * 0.38);
  shape.bezierCurveTo(w * 0.25, -h * 0.46, w * 0.12, -h * 0.50, 0, -h * 0.52);
  shape.bezierCurveTo(-w * 0.12, -h * 0.50, -w * 0.25, -h * 0.46, -w * 0.46, -h * 0.38);
  shape.bezierCurveTo(-w * 0.50, -h * 0.26, -w * 0.52, 0, -w * 0.50, h * 0.26);
  shape.bezierCurveTo(-w * 0.44, h * 0.40, -w * 0.25, h * 0.46, 0, h * 0.44);

  const extrudeSettings = {
    depth: d * 0.18,
    bevelEnabled: true,
    bevelSegments: 6,
    steps: 1,
    bevelSize: 0.04,
    bevelThickness: 0.04
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const curveZ = -Math.pow(v.x / (w * 0.52), 2) * (d * 0.38);
    pos.setXYZ(i, v.x, v.y, v.z + curveZ);
  }
  geo.computeVertexNormals();
  return geo;
}

function createPelvisGeometry(w = 0.96, h = 0.62, d = 0.44) {
  const shape = new THREE.Shape();
  shape.moveTo(0, h * 0.48);
  shape.bezierCurveTo(w * 0.25, h * 0.48, w * 0.44, h * 0.44, w * 0.52, h * 0.34);
  shape.bezierCurveTo(w * 0.54, 0.08, w * 0.46, -h * 0.22, w * 0.36, -h * 0.44);
  shape.bezierCurveTo(w * 0.20, -h * 0.50, w * 0.10, -h * 0.52, 0, -h * 0.52);
  shape.bezierCurveTo(-w * 0.10, -h * 0.52, -w * 0.20, -h * 0.50, -w * 0.36, -h * 0.44);
  shape.bezierCurveTo(-w * 0.46, -h * 0.22, -w * 0.54, 0.08, -w * 0.52, h * 0.34);
  shape.bezierCurveTo(-w * 0.44, h * 0.44, -w * 0.25, h * 0.48, 0, h * 0.48);

  const extrudeSettings = {
    depth: d * 0.20,
    bevelEnabled: true,
    bevelSegments: 6,
    steps: 1,
    bevelSize: 0.04,
    bevelThickness: 0.04
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const curveZ = -Math.pow(v.x / (w * 0.52), 2) * (d * 0.38);
    pos.setXYZ(i, v.x, v.y, v.z + curveZ);
  }
  geo.computeVertexNormals();
  return geo;
}

// ----------------------------------------------------
// Main Robot Shell Builder
// ----------------------------------------------------

export function buildRobotShell(fbx, boneMap) {
  const materials = createRobotMaterials();

  // Hide original MakeHuman meshes
  fbx.traverse((child) => {
    if (child.isMesh && !child.name.startsWith('robot_')) {
      child.visible = false;
    }
  });

  const findBone = (name) => {
    if (boneMap && boneMap.has && boneMap.has(name)) {
      return boneMap.get(name);
    }
    let result = null;
    fbx.traverse((child) => {
      if (!result && child.isBone && child.name === name) {
        result = child;
      }
    });
    return result;
  };

  // ========================================================
  // 1. HEAD (Reference-Accurate Faceted Helmet with Prominent Visor)
  // ========================================================
  // Note: MakeHuman head bone has local +Z pointing to world -Z.
  // We apply headGroup.rotation.y = Math.PI so local +Z points FORWARD (towards camera).
  const headBone = findBone('head');
  if (headBone) {
    const headGroup = new THREE.Group();
    headGroup.name = 'robot_head_assembly';
    headGroup.rotation.y = Math.PI;

    const r = 0.38;
    const h = 0.56;

    // A. Sculpted Cranium Helmet Shell (Cyan metallic)
    const cranium = new THREE.Mesh(createHelmetGeometry(), materials.cyanMetallic);
    cranium.position.set(0, h * 0.55, -0.02);
    headGroup.add(cranium);

    // B. Prominent Obsidian Glossy Visor Faceplate (Front +Z)
    const visor = new THREE.Mesh(createVisorGeometry(), materials.visorDark);
    visor.position.set(0, h * 0.52, 0.05);
    headGroup.add(visor);

    // C. Concentric Circular Ear Pods (Left & Right temples)
    [-1, 1].forEach((side) => {
      const earGroup = new THREE.Group();
      earGroup.position.set(side * (r * 0.86), h * 0.60, -0.02);

      // Charcoal outer bezel
      const earOuter = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.045, 32),
        materials.darkCharcoal
      );
      earOuter.rotation.z = Math.PI / 2;
      earGroup.add(earOuter);

      // Luminous cyan glowing ring
      const earRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.086, 0.013, 12, 32),
        materials.cyanGlow
      );
      earRing.rotation.y = Math.PI / 2;
      earGroup.add(earRing);

      // Dark joint center disc
      const earCore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.062, 0.062, 0.055, 24),
        materials.darkJoint
      );
      earCore.rotation.z = Math.PI / 2;
      earGroup.add(earCore);

      headGroup.add(earGroup);
    });

    // D. Base Cranial Pivot Joint Socket
    const baseJoint = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 20, 20),
      materials.darkCharcoal
    );
    baseJoint.position.set(0, 0, 0);
    headGroup.add(baseJoint);

    headBone.add(headGroup);
  }

  // ========================================================
  // 2. NECK (Segmented Cervical Column with Ribbed Rings)
  // ========================================================
  const neckBone = findBone('neck');
  if (neckBone) {
    const neckGroup = new THREE.Group();
    neckGroup.name = 'robot_neck_assembly';
    neckGroup.rotation.y = Math.PI;

    const neckLen = 0.54;
    const neckR = 0.17;

    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(neckR * 0.95, neckR * 1.25, neckLen * 1.25, 24),
      materials.darkCharcoal
    );
    column.position.set(0, neckLen * 0.45, 0);
    neckGroup.add(column);

    [-0.05, 0.30, 0.65].forEach((ratio) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(neckR * 1.10, 0.024, 8, 28),
        materials.darkJoint
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, ratio * neckLen, 0);
      neckGroup.add(ring);
    });

    neckBone.add(neckGroup);
  }

  // ========================================================
  // 3. CONTINUOUS SCULPTED TORSO (Seamless Mechanical Overlap, Zero Gaps)
  // ========================================================
  const upperChest = findBone('upper-chest');
  const chest = findBone('chest');
  const spine = findBone('spine');
  const hips = findBone('hips');

  // A. UPPER CHEST / BREASTPLATE CUIRASS (Matching Image 2 and Reference Close-up Torso)
  if (upperChest) {
    const chestGroup = new THREE.Group();
    chestGroup.name = 'robot_upper_chest_assembly';

    const w = 1.08;
    const h = 0.58;
    const d = 0.48;

    // Sculpted continuous breastplate cuirass with central peak & curved contours
    const breastplate = new THREE.Mesh(createBreastplateGeometry(w, h, d), materials.cyanMetallic);
    breastplate.position.set(0, h * 0.44, d * 0.14);
    chestGroup.add(breastplate);

    // Clavicle shoulder bridge sweeping across top of chest
    const shoulderBridge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, w * 1.22, 24),
      materials.cyanMetallic
    );
    shoulderBridge.rotation.z = Math.PI / 2;
    shoulderBridge.position.set(0, h * 0.88, 0.02);
    chestGroup.add(shoulderBridge);

    // Sculpted upper back dorsal cowl (Matching reference Back View)
    const backGeo = new THREE.BoxGeometry(w * 0.94, h * 0.88, d * 0.40);
    const backPlate = new THREE.Mesh(backGeo, materials.cyanMetallic);
    backPlate.position.set(0, h * 0.44, -d * 0.24);
    chestGroup.add(backPlate);

    // Collar cradle / neck socket
    const collarCradle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.40, 0.20, 24),
      materials.darkCharcoal
    );
    collarCradle.position.set(0, h * 0.94, 0);
    chestGroup.add(collarCradle);

    upperChest.add(chestGroup);
  }

  // B. MID TORSO (Chest bone: lower breastplate taper + dark charcoal flexible midriff band)
  if (chest) {
    const midGroup = new THREE.Group();
    midGroup.name = 'robot_mid_torso_assembly';

    const w = 0.96;
    const h = 0.76;
    const d = 0.44;

    // Continuous charcoal flex column spanning downward to meet spine
    const flexCore = new THREE.Mesh(
      new THREE.CylinderGeometry(w * 0.44, w * 0.42, h * 1.40, 24),
      materials.darkCharcoal
    );
    flexCore.scale.set(1.0, 1.0, d / w);
    flexCore.position.set(0, h * 0.35, 0);
    midGroup.add(flexCore);

    chest.add(midGroup);
  }

  // C. ABDOMINAL WAIST (Spine bone: deep overlapping core + cyan abdominal belt plate)
  if (spine) {
    const absGroup = new THREE.Group();
    absGroup.name = 'robot_abdominal_assembly';

    const w = 0.92;
    const h = 1.11;
    const d = 0.44;

    // Massive continuous dark charcoal core spanning from below hips (Y = -0.6) to mid-chest (Y = 0.9)
    // GUARANTEES ZERO EMPTY VOIDS OR GAPS REGARDLESS OF SIGN MOTION
    const waistCore = new THREE.Mesh(
      new THREE.CylinderGeometry(w * 0.43, w * 0.45, h * 1.85, 24),
      materials.darkCharcoal
    );
    waistCore.scale.set(1.0, 1.0, d / w);
    waistCore.position.set(0, h * 0.15, 0);
    absGroup.add(waistCore);

    // Sculpted cyan horizontal abdominal armor band (Matching Image 2 and Reference Close-up Torso)
    const absPlate = new THREE.Mesh(createAbdominalBandGeometry(w, 0.44, d), materials.cyanMetallic);
    absPlate.position.set(0, h * 0.28, d * 0.14);
    absGroup.add(absPlate);

    // Lumbar back armor plate
    const lumbarPlate = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.88, 0.40, d * 0.32),
      materials.cyanMetallic
    );
    lumbarPlate.position.set(0, h * 0.28, -d * 0.20);
    absGroup.add(lumbarPlate);

    spine.add(absGroup);
  }

  // D. PELVIS / LOWER TORSO (Hips bone: continuous hip casing overlapping into spine)
  if (hips) {
    const hipsGroup = new THREE.Group();
    hipsGroup.name = 'robot_pelvis_assembly';

    const w = 0.94;
    const h = 1.11;
    const d = 0.46;

    // Upward telescoping dark charcoal core meeting spine core
    const hipCore = new THREE.Mesh(
      new THREE.CylinderGeometry(w * 0.44, w * 0.42, h * 1.30, 24),
      materials.darkCharcoal
    );
    hipCore.scale.set(1.0, 1.0, d / w);
    hipCore.position.set(0, h * 0.55, 0);
    hipsGroup.add(hipCore);

    // Sculpted cyan pelvic armor casing
    const pelvisPlate = new THREE.Mesh(createPelvisGeometry(w, 0.62, d), materials.cyanMetallic);
    pelvisPlate.position.set(0, h * 0.44, 0.04);
    hipsGroup.add(pelvisPlate);

    // Dark charcoal central groin / mechanical recess
    const groinRecess = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.36, 0.60, d * 0.88),
      materials.darkCharcoal
    );
    groinRecess.position.set(0, h * 0.42, 0.02);
    hipsGroup.add(groinRecess);

    hips.add(hipsGroup);
  }

  // ========================================================
  // 4. CONNECTED SHOULDERS & ARTICULATED MECHANICAL ARMS
  // ========================================================
  ['L', 'R'].forEach((side) => {
    const isLeft = side === 'L';
    const sign = isLeft ? 1 : -1;

    const shoulder = findBone(`shoulder${side}`);
    const upperarm = findBone(`upperarm${side}`);
    const forearm = findBone(`forearm${side}`);
    const hand = findBone(`hand${side}`);

    // Shoulder Clavicle Bracket connecting torso directly to shoulder socket
    if (shoulder) {
      const shGroup = new THREE.Group();
      shGroup.name = `robot_shoulder_cowl_${side}`;

      const bracketLen = 0.35;
      const cowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.16, bracketLen * 1.08, 20),
        materials.cyanMetallic
      );
      cowl.position.set(0, bracketLen * 0.50, 0);
      shGroup.add(cowl);

      shoulder.add(shGroup);
    }

    // Upper Arm (Spherical shoulder ball joint, lateral concentric disc, & tapered bicep)
    if (upperarm) {
      const uArmGroup = new THREE.Group();
      uArmGroup.name = `robot_upperarm_assembly_${side}`;

      const armLen = 1.042;
      const armR = 0.16;

      // Dark charcoal spherical shoulder ball joint (0, 0, 0)
      const shoulderBall = new THREE.Mesh(
        new THREE.SphereGeometry(armR * 1.25, 24, 20),
        materials.darkCharcoal
      );
      uArmGroup.add(shoulderBall);

      // Lateral circular pivot cap (concentric disc matching reference!)
      const pivotDiscGroup = new THREE.Group();
      pivotDiscGroup.position.set(sign * (armR * 1.12), 0, 0);

      const discOuter = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.13, 0.04, 28),
        materials.darkCharcoal
      );
      discOuter.rotation.z = Math.PI / 2;
      pivotDiscGroup.add(discOuter);

      const discCyanRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.090, 0.012, 10, 28),
        materials.cyanGlow
      );
      discCyanRing.rotation.y = Math.PI / 2;
      pivotDiscGroup.add(discCyanRing);

      const discInner = new THREE.Mesh(
        new THREE.CylinderGeometry(0.060, 0.060, 0.05, 20),
        materials.darkJoint
      );
      discInner.rotation.z = Math.PI / 2;
      pivotDiscGroup.add(discInner);

      uArmGroup.add(pivotDiscGroup);

      // Sleek shoulder pauldron cap (cyan metallic)
      const pauldron = new THREE.Mesh(
        new THREE.SphereGeometry(armR * 1.45, 24, 20, 0, Math.PI, 0, Math.PI * 0.60),
        materials.cyanMetallic
      );
      pauldron.position.set(sign * armR * 0.16, armR * 0.30, 0);
      pauldron.rotation.z = isLeft ? -Math.PI * 0.18 : Math.PI * 0.18;
      uArmGroup.add(pauldron);

      // Contoured cyan metallic bicep sleeve
      const bicepSleeve = new THREE.Mesh(
        new THREE.CylinderGeometry(armR * 0.90, armR * 1.05, armLen * 0.88, 24),
        materials.cyanMetallic
      );
      bicepSleeve.position.set(0, armLen * 0.50, 0);
      uArmGroup.add(bicepSleeve);

      // Dark charcoal inner mechanical channel
      const innerChannel = new THREE.Mesh(
        new THREE.BoxGeometry(armR * 0.35, armLen * 0.84, armR * 1.85),
        materials.darkCharcoal
      );
      innerChannel.position.set(sign * -armR * 0.70, armLen * 0.50, 0);
      uArmGroup.add(innerChannel);

      upperarm.add(uArmGroup);
    }

    // Forearm (Dual-hinge charcoal elbow & beveled forearm sleeve with wrist cuff)
    if (forearm) {
      const fArmGroup = new THREE.Group();
      fArmGroup.name = `robot_forearm_assembly_${side}`;

      const fLen = 1.178;
      const fR = 0.145;

      // Dark charcoal elbow joint pivot
      const elbowPivot = new THREE.Mesh(
        new THREE.CylinderGeometry(fR * 1.20, fR * 1.20, fR * 1.75, 24),
        materials.darkCharcoal
      );
      elbowPivot.rotation.x = Math.PI / 2;
      fArmGroup.add(elbowPivot);

      // Lateral elbow concentric discs
      [-1, 1].forEach((discSide) => {
        const disc = new THREE.Mesh(
          new THREE.CylinderGeometry(fR * 0.80, fR * 0.80, 0.03, 20),
          materials.darkJoint
        );
        disc.rotation.x = Math.PI / 2;
        disc.position.set(0, 0, discSide * fR * 0.90);
        fArmGroup.add(disc);
      });

      // Sculpted forearm armor sleeve (cyan metallic)
      const forearmSleeve = new THREE.Mesh(
        new THREE.CylinderGeometry(fR * 0.84, fR * 1.05, fLen * 0.88, 24),
        materials.cyanMetallic
      );
      forearmSleeve.position.set(0, fLen * 0.50, 0);
      fArmGroup.add(forearmSleeve);

      // Dark charcoal circular wrist cuff (Matching reference Close-up Hand)
      const wristCuff = new THREE.Mesh(
        new THREE.CylinderGeometry(fR * 0.98, fR * 0.90, fLen * 0.14, 24),
        materials.darkCharcoal
      );
      wristCuff.position.set(0, fLen * 0.92, 0);
      fArmGroup.add(wristCuff);

      forearm.add(fArmGroup);
    }

    // ========================================================
    // 5. ENLARGED ARTICULATED HANDS (Matching Image 2 & Reference Close-up Hand)
    // ========================================================
    if (hand) {
      const handGroup = new THREE.Group();
      handGroup.name = `robot_hand_chassis_${side}`;

      // Large dark charcoal spherical wrist joint
      const wristBall = new THREE.Mesh(
        new THREE.SphereGeometry(0.125, 20, 20),
        materials.darkCharcoal
      );
      handGroup.add(wristBall);

      // Palm dimensions matching actual bone span
      const palmLen = 0.52;
      const palmW = 0.38;
      const palmD = 0.14;

      // Dark charcoal ergonomic palm chassis
      const palmChassis = new THREE.Mesh(
        new THREE.BoxGeometry(palmW, palmLen * 0.96, palmD),
        materials.darkCharcoal
      );
      palmChassis.position.set(0, palmLen * 0.48, -0.01);
      handGroup.add(palmChassis);

      // 4 Individual Trapezoidal Cyan Armor Plates on Dorsal Hand
      const metacarpalX = sign > 0 
        ? [0.12, 0.04, -0.04, -0.11] // Left hand: index to little
        : [-0.12, -0.04, 0.04, 0.11]; // Right hand: index to little

      metacarpalX.forEach((mX) => {
        const plate = new THREE.Mesh(
          new THREE.BoxGeometry(0.065, palmLen * 0.74, 0.04),
          materials.cyanMetallic
        );
        plate.position.set(mX, palmLen * 0.50, palmD * 0.42 + 0.01);
        handGroup.add(plate);
      });

      // Dedicated Cyan Dorsal Armor Plate for the Thumb Carpal Root
      const thumbPlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, palmLen * 0.46, 0.04),
        materials.cyanMetallic
      );
      thumbPlate.position.set(sign * 0.14, palmLen * 0.22, palmD * 0.38);
      thumbPlate.rotation.z = sign * 0.40;
      handGroup.add(thumbPlate);

      // Transverse Knuckle Housing Bar across base of fingers
      const knuckleBar = new THREE.Mesh(
        new THREE.BoxGeometry(palmW * 1.04, 0.07, palmD * 1.08),
        materials.darkJoint
      );
      knuckleBar.position.set(0, palmLen * 0.95, -0.01);
      handGroup.add(knuckleBar);

      hand.add(handGroup);

      // INDIVIDUAL ARTICULATED FINGERS (Thumb, Index, Middle, Ring, Little)
      // Segment lengths precisely tuned to the MakeHuman skeleton bones
      const fingerConfigs = [
        {
          name: 'thumb',
          bones: [`thumb01${side}`, `thumb02${side}`, `thumb03${side}`],
          lengths: [0.14, 0.15, 0.12],
          radius: 0.044
        },
        {
          name: 'index',
          bones: [`index01${side}`, `index02${side}`, `index03${side}`],
          lengths: [0.12, 0.11, 0.10],
          radius: 0.038
        },
        {
          name: 'middle',
          bones: [`middle01${side}`, `middle02${side}`, `middle03${side}`],
          lengths: [0.15, 0.13, 0.11],
          radius: 0.040
        },
        {
          name: 'ring',
          bones: [`ring01${side}`, `ring02${side}`, `ring03${side}`],
          lengths: [0.14, 0.12, 0.10],
          radius: 0.038
        },
        {
          name: 'little',
          bones: [`little01${side}`, `little02${side}`, `little03${side}`],
          lengths: [0.11, 0.09, 0.08],
          radius: 0.034
        }
      ];

      fingerConfigs.forEach(({ bones, lengths, radius }) => {
        const b1 = findBone(bones[0]);
        const b2 = findBone(bones[1]);
        const b3 = findBone(bones[2]);

        // Proximal Phalanx (b1)
        if (b1) {
          const segGroup = new THREE.Group();
          segGroup.name = `robot_phalanx_${bones[0]}`;

          // Dark charcoal knuckle joint sphere at base (0, 0, 0)
          const knuckleJoint = new THREE.Mesh(
            new THREE.SphereGeometry(radius * 1.25, 16, 16),
            materials.darkCharcoal
          );
          segGroup.add(knuckleJoint);

          // Cyan metallic dorsal phalanx shell (matching reference close-up)
          const len = lengths[0];
          const shell = new THREE.Mesh(
            new THREE.CylinderGeometry(radius * 0.95, radius * 1.05, len * 0.86, 16),
            materials.cyanMetallic
          );
          shell.position.set(0, len * 0.50, 0);
          segGroup.add(shell);

          // Dark charcoal ventral grip pad
          const grip = new THREE.Mesh(
            new THREE.BoxGeometry(radius * 1.3, len * 0.80, radius * 0.5),
            materials.darkCharcoal
          );
          grip.position.set(0, len * 0.50, -radius * 0.6);
          segGroup.add(grip);

          b1.add(segGroup);
        }

        // Intermediate Phalanx (b2)
        if (b2) {
          const segGroup = new THREE.Group();
          segGroup.name = `robot_phalanx_${bones[1]}`;

          // Dark charcoal interphalangeal joint
          const joint = new THREE.Mesh(
            new THREE.SphereGeometry(radius * 1.15, 14, 14),
            materials.darkCharcoal
          );
          segGroup.add(joint);

          // Cyan metallic intermediate shell
          const len = lengths[1];
          const shell = new THREE.Mesh(
            new THREE.CylinderGeometry(radius * 0.88, radius * 0.96, len * 0.86, 16),
            materials.cyanMetallic
          );
          shell.position.set(0, len * 0.50, 0);
          segGroup.add(shell);

          b2.add(segGroup);
        }

        // Distal Fingertip Phalanx (b3)
        if (b3) {
          const tipGroup = new THREE.Group();
          tipGroup.name = `robot_fingertip_${bones[2]}`;

          // Distal joint
          const distJoint = new THREE.Mesh(
            new THREE.SphereGeometry(radius * 1.05, 12, 12),
            materials.darkCharcoal
          );
          tipGroup.add(distJoint);

          // Rounded cyan metallic fingertip capsule
          const len = lengths[2];
          const tipCapsule = new THREE.Mesh(
            new THREE.CapsuleGeometry(radius * 0.85, len * 0.65, 10, 14),
            materials.cyanMetallic
          );
          tipCapsule.position.set(0, len * 0.50, 0);
          tipGroup.add(tipCapsule);

          // Dark charcoal tactile sensor pad on fingertip
          const sensorPad = new THREE.Mesh(
            new THREE.SphereGeometry(radius * 0.70, 10, 10),
            materials.darkCharcoal
          );
          sensorPad.position.set(0, len * 0.75, -radius * 0.25);
          tipGroup.add(sensorPad);

          b3.add(tipGroup);
        }
      });
    }
  });

  console.log('[ROBOT_SHELL] Reference-accurate futuristic robot avatar built successfully.');
}
