/* brain3d.js — Interactive 3D Drosophila brain visualization
 * Reads live connectome activation levels from BRAIN.postSynaptic
 * and renders a Three.js scene with glowing neuropil regions.
 */
(function () {

var REGION_COLORS = {
    Sensorial: 0x3b82f6,
    Central: 0x8b5cf6,
    Impulsos:  0xf59e0b,
    Motor:   0xef4444
};

var ACTIVATION_DIVISOR = 80;
var BASE_OPACITY = 0.3;
var MAX_OPACITY = 0.8;
var BASE_EMISSIVE_INTENSITY = 0.0;
var MAX_EMISSIVE_INTENSITY = 1.0;
var HIGHLIGHT_OPACITY = 0.9;
var HIGHLIGHT_EMISSIVE = 1.5;
var HIGHLIGHT_FADE_MS = 300;

var REGION_DEFS = [
    {
        name: 'Lóbulos Ópticos',
        description: 'Procesamiento visual — detección de movimiento, color y flujo óptico',
        type: 'Sensorial',
        neurons: ['VIS_R1R6', 'VIS_R7R8', 'VIS_ME', 'VIS_LO', 'VIS_LC', 'VIS_LPTC'],
        meshDefs: [
            { geo: 'sphere', args: [1.4, 16, 12], pos: [-3.2, 0.2, -0.3], scale: [1, 0.75, 1.1] },
            { geo: 'sphere', args: [1.4, 16, 12], pos: [3.2, 0.2, -0.3], scale: [1, 0.75, 1.1] }
        ]
    },
    {
        name: 'Lóbulos Antennales',
        description: 'Procesamiento olfativo — detección de olores de comida y peligro',
        type: 'Sensorial',
        neurons: ['OLF_ORN_FOOD', 'OLF_ORN_DANGER', 'OLF_LN', 'OLF_PN'],
        meshDefs: [
            { geo: 'sphere', args: [0.45, 12, 10], pos: [-0.7, -0.6, 2.2], scale: [1, 1, 1] },
            { geo: 'sphere', args: [0.45, 12, 10], pos: [0.7, -0.6, 2.2], scale: [1, 1, 1] }
        ]
    },
    {
        name: 'Cuerpos Hongos',
        description: 'Aprendizaje y memoria — memorias olfativas asociativas, recompensa y castigo',
        type: 'Central',
        neurons: ['MB_KC', 'MB_APL', 'MB_MBON_APP', 'MB_MBON_AV', 'MB_DAN_REW', 'MB_DAN_PUN'],
        meshDefs: [
            { geo: 'sphere', args: [0.6, 12, 10], pos: [-1.3, 1.0, -0.3], scale: [1, 1, 1] },
            { geo: 'sphere', args: [0.6, 12, 10], pos: [1.3, 1.0, -0.3], scale: [1, 1, 1] },
            { geo: 'torus', args: [0.4, 0.12, 8, 16], pos: [-0.6, 0.2, 1.0], scale: [1, 1, 1], rot: [Math.PI / 2, 0, 0] },
            { geo: 'torus', args: [0.4, 0.12, 8, 16], pos: [0.6, 0.2, 1.0], scale: [1, 1, 1], rot: [Math.PI / 2, 0, 0] }
        ]
    },
    {
        name: 'Complejo Central',
        description: 'Navegación — dirección, integración de trayectoria y coordinación motriz',
        type: 'Central',
        neurons: ['CX_EPG', 'CX_PFN', 'CX_FC', 'CX_HDELTA', 'CLOCK_DN'],
        meshDefs: [
            { geo: 'cylinder', args: [0.8, 0.8, 0.2, 16], pos: [0, 0.5, 0], scale: [1, 1, 1], rot: [Math.PI / 2, 0, 0] }
        ]
    },
    {
        name: 'Cuerno Lateral',
        description: 'Respuestas innatas a olores — comportamientos cableados de aproximación y evitación',
        type: 'Central',
        neurons: ['LH_APP', 'LH_AV'],
        meshDefs: [
            { geo: 'sphere', args: [0.45, 12, 10], pos: [-1.8, 0.5, 0.3], scale: [1, 1, 1] },
            { geo: 'sphere', args: [0.45, 12, 10], pos: [1.8, 0.5, 0.3], scale: [1, 1, 1] }
        ]
    },
    {
        name: 'Zona Subesofágica',
        description: 'Centro de mando de alimentación y aseo — procesamiento del gusto y comandos Motores',
        type: 'Central',
        neurons: ['SEZ_FEED', 'SEZ_GROOM', 'SEZ_WATER', 'GUS_GRN_SWEET', 'GUS_GRN_BITTER', 'GUS_GRN_WATER', 'GNG_DESC'],
        meshDefs: [
            { geo: 'sphere', args: [0.7, 12, 10], pos: [0, -1.0, 1.2], scale: [1.2, 0.7, 0.8] }
        ]
    },
    {
        name: 'VNC / Motor',
        description: 'Salida Motora — locomoción, vuelo y comandos de movimiento corporal',
        type: 'Motor',
        neurons: ['DN_WALK', 'DN_FLIGHT', 'DN_TURN', 'DN_BACKUP', 'DN_STARTLE', 'VNC_CPG'],
        collectMNPrefix: true,
        meshDefs: [
            { geo: 'cylinder', args: [0.35, 0.25, 2.5, 12], pos: [0, -1.5, -1.8], scale: [1, 1, 1], rot: [0.3, 0, 0] }
        ]
    },
    {
        name: 'Termosensorial',
        description: 'Detección de temperatura — calor y frío',
        type: 'Sensorial',
        neurons: ['THERMO_WARM', 'THERMO_COOL'],
        meshDefs: [
            { geo: 'sphere', args: [0.3, 10, 8], pos: [0, 0.0, 2.8], scale: [1, 1, 1] }
        ]
    },
    {
        name: 'Mecanosensorial',
        description: 'Tacto y propiocepción — detección de cerdas, viento y posición corporal',
        type: 'Sensorial',
        neurons: ['MECH_BRISTLE', 'MECH_JO', 'MECH_CHORD', 'ANTENNAL_MECH', 'NOCI'],
        meshDefs: [
            { geo: 'sphere', args: [0.35, 10, 8], pos: [0, 0.7, 1.8], scale: [1, 1, 1] }
        ]
    },
    {
        name: 'Impulsos',
        description: 'Estados motivacionales internos — hambre, miedo, fatiga, curiosidad, impulso de aseo',
        type: 'Impulsos',
        neurons: ['DRIVE_HUNGER', 'DRIVE_FEAR', 'DRIVE_FATIGUE', 'DRIVE_CURIOSITY', 'DRIVE_GROOM'],
        meshDefs: [
            { geo: 'sphere', args: [0.5, 12, 10], pos: [0, 0.3, -0.3], scale: [1, 1, 1] }
        ]
    }
];

window.Cerebro3D = {
    active: false,
    _initialized: false,
    _scene: null,
    _camera: null,
    _renderer: null,
    _controls: null,
    _regions: [],
    _allMeshes: [],
    _raycaster: null,
    _mouse: null,
    _container: null,
    _tooltipEl: null,
    _animFrameId: null,
    _initFailed: false,

    init: function () {
        if (Cerebro3D._initialized) return;
        Cerebro3D._container = document.getElementById('brain3d-overlay');
        Cerebro3D._tooltipEl = document.getElementById('brain3d-tooltip');
        try {
            Cerebro3D._scene = new THREE.Scene();
            Cerebro3D._scene.background = new THREE.Color(0x0a0a1a);

            var width = Cerebro3D._container.clientWidth || window.innerWidth;
            var height = Cerebro3D._container.clientHeight || (window.innerHeight - 44 - 90);

            Cerebro3D._camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
            Cerebro3D._camera.position.set(0, 6, 10);

            Cerebro3D._renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
            Cerebro3D._renderer.setSize(width, height);
            Cerebro3D._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            Cerebro3D._container.appendChild(Cerebro3D._renderer.domElement);

            Cerebro3D._controls = new THREE.OrbitControls(Cerebro3D._camera, Cerebro3D._renderer.domElement);
            Cerebro3D._controls.enableDamping = true;
            Cerebro3D._controls.dampingFactor = 0.08;
            Cerebro3D._controls.target.set(0, 0, 0);
            Cerebro3D._controls.update();

            Cerebro3D._scene.add(new THREE.AmbientLuz(0x404060, 0.6));
            var pointLuz1 = new THREE.PointLuz(0xffffff, 0.8, 50);
            pointLuz1.position.set(5, 8, 5);
            Cerebro3D._scene.add(pointLuz1);
            var pointLuz2 = new THREE.PointLuz(0x8888ff, 0.4, 50);
            pointLuz2.position.set(-5, -3, -5);
            Cerebro3D._scene.add(pointLuz2);

            Cerebro3D._buildRegions();

            Cerebro3D._raycaster = new THREE.Raycaster();
            Cerebro3D._mouse = new THREE.Vector2();

            Cerebro3D._renderer.domElement.addEventListener('mousemove', Cerebro3D._onMouseMove);

            Cerebro3D._initialized = true;
        } catch (e) {
            console.warn('Cerebro3D: WebGL not available', e);
            Cerebro3D._initFailed = true;
            Cerebro3D._initialized = false;
            return;
        }
    },

    _buildRegions: function () {
        Cerebro3D._regions = [];
        Cerebro3D._allMeshes = [];

        for (var i = 0; i < REGION_DEFS.length; i++) {
            var regionDef = REGION_DEFS[i];
            var neuronList = regionDef.neurons.slice();

            if (regionDef.collectMNPrefix === true) {
                var keys = Object.keys(BRAIN.postSynaptic);
                for (var k = 0; k < keys.length; k++) {
                    if (keys[k].indexOf('MN_') === 0 && neuronList.indexOf(keys[k]) === -1) {
                        neuronList.push(keys[k]);
                    }
                }
            }

            var colorHex = REGION_COLORS[regionDef.type];
            var region = {
                name: regionDef.name,
                description: regionDef.description,
                type: regionDef.type,
                neurons: neuronList,
                meshes: [],
                activation: 0,
                _highlightUntil: 0
            };

            for (var m = 0; m < regionDef.meshDefs.length; m++) {
                var meshDef = regionDef.meshDefs[m];
                var geometry;
                if (meshDef.geo === 'sphere') {
                    geometry = new THREE.SphereGeometry(meshDef.args[0], meshDef.args[1], meshDef.args[2]);
                } else if (meshDef.geo === 'torus') {
                    geometry = new THREE.TorusGeometry(meshDef.args[0], meshDef.args[1], meshDef.args[2], meshDef.args[3]);
                } else if (meshDef.geo === 'cylinder') {
                    geometry = new THREE.CylinderGeometry(meshDef.args[0], meshDef.args[1], meshDef.args[2], meshDef.args[3]);
                }

                var material = new THREE.MeshStandardMaterial({
                    color: colorHex,
                    emissive: colorHex,
                    emissiveIntensity: 0,
                    transparent: true,
                    opacity: 0.3,
                    depthWrite: false,
                    roughness: 0.6,
                    metalness: 0.1
                });

                var mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(meshDef.pos[0], meshDef.pos[1], meshDef.pos[2]);
                mesh.scale.set(meshDef.scale[0], meshDef.scale[1], meshDef.scale[2]);
                if (meshDef.rot) {
                    mesh.rotation.set(meshDef.rot[0], meshDef.rot[1], meshDef.rot[2]);
                }
                mesh.userData.region = region;
                mesh.renderOrder = 1;
                Cerebro3D._scene.add(mesh);
                region.meshes.push(mesh);
                Cerebro3D._allMeshes.push(mesh);
            }

            Cerebro3D._regions.push(region);
        }

        // Faint wireframe outline for spatial reference
        var outlineGeo = new THREE.SphereGeometry(4.5, 16, 12);
        var outlineMat = new THREE.MeshBasicMaterial({
            color: 0x223355,
            wireframe: true,
            transparent: true,
            opacity: 0.06
        });
        var outline = new THREE.Mesh(outlineGeo, outlineMat);
        outline.position.set(0, 0, 0);
        outline.scale.set(1, 0.6, 0.9);
        Cerebro3D._scene.add(outline);
    },

    show: function () {
        if (Cerebro3D._initFailed) return;
        if (!Cerebro3D._initialized) {
            Cerebro3D._container = document.getElementById('brain3d-overlay');
            Cerebro3D._container.style.display = 'flex';
            Cerebro3D.init();
            if (!Cerebro3D._initialized) {
                Cerebro3D._container.style.display = 'none';
                Cerebro3D.active = false;
                return;
            }
            // Add header with close button
            var header = document.createElement('div');
            header.className = 'brain3d-header';
            header.innerHTML = '<span class="brain3d-title">&#129504; Cerebro 3D &mdash; PsycodelicMosca</span><button class="brain3d-close-btn" id="brain3d-close-btn">&#10005;</button>';
            Cerebro3D._container.insertBefore(header, Cerebro3D._container.firstChild);
            document.getElementById('brain3d-close-btn').addEventListener('click', function () {
                Cerebro3D.hide();
                var btn = document.getElementById('brain3dBtn');
                if (btn) btn.classList.remove('active');
            });
        } else {
            Cerebro3D._container.style.display = 'flex';
        }
        Cerebro3D.active = true;
        window.addEventListener('resize', Cerebro3D._onResize);
        Cerebro3D._renderer.domElement.addEventListener('mouseleave', Cerebro3D._onMouseLeave);
        Cerebro3D._onResize();
        Cerebro3D._renderLoop();
    },

    hide: function () {
        window.removeEventListener('resize', Cerebro3D._onResize);
        if (Cerebro3D._renderer) {
            Cerebro3D._renderer.domElement.removeEventListener('mouseleave', Cerebro3D._onMouseLeave);
        }
        if (Cerebro3D._container) {
            Cerebro3D._container.style.display = 'none';
        }
        Cerebro3D.active = false;
        if (Cerebro3D._tooltipEl) {
            Cerebro3D._tooltipEl.style.display = 'none';
        }
        if (Cerebro3D._animFrameId !== null) {
            cancelAnimationFrame(Cerebro3D._animFrameId);
            Cerebro3D._animFrameId = null;
        }
    },

    toggle: function () {
        if (Cerebro3D.active) {
            Cerebro3D.hide();
        } else {
            Cerebro3D.show();
        }
    },

    _renderLoop: function () {
        if (!Cerebro3D.active) return;
        Cerebro3D._animFrameId = requestAnimationFrame(Cerebro3D._renderLoop);
        Cerebro3D._controls.update();
        Cerebro3D._renderer.render(Cerebro3D._scene, Cerebro3D._camera);
    },

    update: function () {
        if (!Cerebro3D.active || !Cerebro3D._initialized) return;

        for (var i = 0; i < Cerebro3D._regions.length; i++) {
            var region = Cerebro3D._regions[i];
            var sum = 0;
            var count = 0;
            for (var n = 0; n < region.neurons.length; n++) {
                var neuronName = region.neurons[n];
                if (BRAIN.postSynaptic[neuronName]) {
                    sum += BRAIN.postSynaptic[neuronName][BRAIN.thisEstado];
                    count++;
                }
            }
            var avg = count > 0 ? sum / count : 0;
            var normalized = Math.min(1, Math.max(0, avg / ACTIVATION_DIVISOR));
            region.activation = normalized;

            var opacity = BASE_OPACITY + normalized * (MAX_OPACITY - BASE_OPACITY);
            var emissiveIntensity = BASE_EMISSIVE_INTENSITY + normalized * (MAX_EMISSIVE_INTENSITY - BASE_EMISSIVE_INTENSITY);

            if (region._highlightUntil > 0) {
                var now = Date.now();
                if (now < region._highlightUntil) {
                    continue;
                }
                var fadeElapsed = now - region._highlightUntil;
                if (fadeElapsed < HIGHLIGHT_FADE_MS) {
                    var t = fadeElapsed / HIGHLIGHT_FADE_MS;
                    var fadeOpacity = HIGHLIGHT_OPACITY + (opacity - HIGHLIGHT_OPACITY) * t;
                    var fadeEmissive = HIGHLIGHT_EMISSIVE + (emissiveIntensity - HIGHLIGHT_EMISSIVE) * t;
                    for (var j = 0; j < region.meshes.length; j++) {
                        region.meshes[j].material.opacity = fadeOpacity;
                        region.meshes[j].material.emissiveIntensity = fadeEmissive;
                    }
                    continue;
                }
                region._highlightUntil = 0;
            }

            for (var j = 0; j < region.meshes.length; j++) {
                region.meshes[j].material.opacity = opacity;
                region.meshes[j].material.emissiveIntensity = emissiveIntensity;
            }
        }
    },

    highlightRegion: function (regionName) {
        if (!Cerebro3D.active || !Cerebro3D._initialized || !Cerebro3D._regions) return;

        var foundRegion = null;
        for (var i = 0; i < Cerebro3D._regions.length; i++) {
            if (Cerebro3D._regions[i].name === regionName) {
                foundRegion = Cerebro3D._regions[i];
                break;
            }
        }
        if (!foundRegion) return;

        foundRegion._highlightUntil = Date.now() + 1200;
        for (var j = 0; j < foundRegion.meshes.length; j++) {
            foundRegion.meshes[j].material.emissiveIntensity = HIGHLIGHT_EMISSIVE;
            foundRegion.meshes[j].material.opacity = HIGHLIGHT_OPACITY;
        }
    },

    _onMouseMove: function (event) {
        var rect = Cerebro3D._renderer.domElement.getBoundingClientRect();
        Cerebro3D._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        Cerebro3D._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        Cerebro3D._raycaster.setFromCamera(Cerebro3D._mouse, Cerebro3D._camera);
        var intersects = Cerebro3D._raycaster.intersectObjects(Cerebro3D._allMeshes);

        if (intersects.length > 0) {
            var region = intersects[0].object.userData.region;
            var regionPopTotal = 0;
            if (typeof neuronPopulations !== 'undefined') {
                for (var p = 0; p < region.neurons.length; p++) {
                    regionPopTotal += (neuronPopulations[region.neurons[p]] || 0);
                }
            }
            var html = '<div class="b3d-tip-name">' + region.name + '</div>';
            html += '<div class="b3d-tip-desc">' + region.description + '</div>';
            if (regionPopTotal > 0) {
                html += '<div class="b3d-tip-pop" style="font-size:0.7rem;color:#8892a4;margin:2px 0 4px;">' + region.neurons.length + ' grupos que representan ~' + regionPopTotal.toLocaleString() + ' neurons</div>';
            }
            html += '<div class="b3d-tip-type">' + region.type.charAt(0).toUpperCase() + region.type.slice(1) + '</div>';
            html += '<div class="b3d-tip-neurons">';
            for (var i = 0; i < region.neurons.length; i++) {
                var nName = region.neurons[i];
                var raw = BRAIN.postSynaptic[nName] ? BRAIN.postSynaptic[nName][BRAIN.thisEstado] : 0;
                var desc = (typeof neuronDescriptions !== 'undefined' && neuronDescriptions[nName]) ? neuronDescriptions[nName] : nName;
                var pct = Math.min(100, Math.max(0, Math.round(raw / ACTIVATION_DIVISOR * 100)));
                html += '<div class="b3d-tip-neuron"><span class="b3d-tip-neuron-name">' + desc + '</span><span class="b3d-tip-neuron-val">' + pct + '%</span></div>';
            }
            html += '</div>';
            Cerebro3D._tooltipEl.innerHTML = html;
            Cerebro3D._tooltipEl.style.left = (event.clientX + 12) + 'px';
            Cerebro3D._tooltipEl.style.top = (event.clientY + 12) + 'px';
            if (event.clientX + 12 + 260 > window.innerWidth) {
                Cerebro3D._tooltipEl.style.left = (event.clientX - 270) + 'px';
            }
            if (event.clientY + 12 + Cerebro3D._tooltipEl.offsetHeight > window.innerHeight - 90) {
                Cerebro3D._tooltipEl.style.top = (event.clientY - Cerebro3D._tooltipEl.offsetHeight - 12) + 'px';
            }
            Cerebro3D._tooltipEl.style.display = 'block';
        } else {
            Cerebro3D._tooltipEl.style.display = 'none';
        }
    },

    _onMouseLeave: function () {
        Cerebro3D._tooltipEl.style.display = 'none';
    },

    _onResize: function () {
        if (!Cerebro3D._renderer) return;
        var width = Cerebro3D._container.clientWidth || window.innerWidth;
        var height = Cerebro3D._container.clientHeight || (window.innerHeight - 44 - 90);
        Cerebro3D._camera.aspect = width / height;
        Cerebro3D._camera.updateProjectionMatrix();
        Cerebro3D._renderer.setSize(width, height);
    }
};

})();
