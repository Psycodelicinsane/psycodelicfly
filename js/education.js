(function () {
    var EDUCATION_REGIONS = [
        {
            id: 'optic-lobes',
            name: 'Lóbulos Ópticos',
            neurons: ['VIS_R1R6', 'VIS_R7R8', 'VIS_ME', 'VIS_LO', 'VIS_LC', 'VIS_LPTC'],
            type: 'Sensorial',
            explanation: 'Los lóbulos ópticos son los centros de procesamiento visual de la mosca, uno a cada lado del cerebro. Detectan movimiento, color, bordes y objetos que se acercan. Casi la mitad del cerebro de la mosca está dedicado a la visión.',
            analogy: 'Como tu córtex visual — pero optimizado para detectar movimiento rápido y evitar matamoscas.',
            interaction: 'Cambia la configuración de Luz de Brillante a Tenue o Oscuro y observa cómo responden los lóbulos ópticos.',
            populationEstimate: '~60,000 neuronas en la mosca real'
        },
        {
            id: 'antennal-lobes',
            name: 'Lóbulos Antennales',
            neurons: ['OLF_ORN_FOOD', 'OLF_ORN_DANGER', 'OLF_LN', 'OLF_PN'],
            type: 'Sensorial',
            explanation: 'Los lóbulos antenales procesan los olores detectados por las antenas. Diferentes olores activan diferentes glomérulos (agrupaciones), permitiendo a la mosca distinguir comida de peligro.',
            analogy: 'Como tu bulbo olfativo — la primera parada para la información olfativa antes de que llegue a áreas cerebrales superiores.',
            interaction: 'Coloca comida en el lienzo y observa cómo se activan las neuronas olfativas cuando la mosca la detecta.',
            populationEstimate: '~2,600 neuronas en ~50 glomérulos'
        },
        {
            id: 'mushroom-bodies',
            name: 'Cuerpos Hongos',
            neurons: ['MB_KC', 'MB_APL', 'MB_MBON_APP', 'MB_MBON_AV', 'MB_DAN_REW', 'MB_DAN_PUN'],
            type: 'Central',
            explanation: 'Los cuerpos hongos son el centro de aprendizaje y memoria de la mosca. Asocian olores con recompensas o castigos, permitiendo a la mosca aprender qué olores significan comida y cuáles peligro.',
            analogy: 'Como el hipocampo de la mosca — forman y recuerdan memorias sobre olores.',
            interaction: 'Alimenta a la mosca repetidamente y observa cómo se activan las neuronas dopaminérgicas de recompensa (DAN) junto con las células de Kenyon.',
            populationEstimate: '~2,000 células de Kenyon + ~400 neuronas de salida/dopamina'
        },
        {
            id: 'Central-complex',
            name: 'Complejo Central',
            neurons: ['CX_EPG', 'CX_PFN', 'CX_FC', 'CX_HDELTA', 'CLOCK_DN'],
            type: 'Central',
            explanation: 'El complejo Central es el centro de navegación de la mosca. Mantiene una brújula interna, rastrea la dirección de la mosca y coordina los patrones de locomoción.',
            analogy: 'Como un GPS y un sistema de dirección combinados — sabe hacia dónde apunta la mosca y planifica a dónde ir.',
            interaction: 'Observa las neuronas brújula (EPG) mientras la mosca camina y cambia de dirección.',
            populationEstimate: '~3,000 neuronas en la mosca real'
        },
        {
            id: 'lateral-horn',
            name: 'Cuerno Lateral',
            neurons: ['LH_APP', 'LH_AV'],
            type: 'Central',
            explanation: 'El cuerno lateral maneja respuestas innatas (no aprendidas) a los olores. A diferencia de los cuerpos hongos que aprenden, el cuerno lateral desencadena comportamientos cableados de aproximación o evitación.',
            analogy: 'Como un reflejo instintivo — retiras la mano de una estufa caliente antes de pensar en ello.',
            interaction: 'Coloca comida cerca de la mosca y observa cómo se activa LH_APP (aproximación). El cuerno lateral responde incluso sin aprendizaje previo.',
            populationEstimate: '~1,400 neuronas'
        },
        {
            id: 'sez',
            name: 'Zona Subesofágica',
            neurons: ['SEZ_FEED', 'SEZ_GROOM', 'SEZ_WATER', 'GUS_GRN_SWEET', 'GUS_GRN_BITTER', 'GUS_GRN_WATER', 'GNG_DESC'],
            type: 'Central',
            explanation: 'La zona subesofágica (SEZ) es el centro de mando para alimentación y aseo. Procesa la información del gusto y envía comandos Motores para extender la proboscida o iniciar el aseo.',
            analogy: 'Como un gerente de cafetería — decide si comer basándose en lo que reportan las papilas gustativas.',
            interaction: 'Alimenta a la mosca y observa cómo se ilumina la SEZ. Toca la mosca para desencadenar los comandos de aseo.',
            populationEstimate: '~7,000 neuronas'
        },
        {
            id: 'vnc-Motor',
            name: 'VNC / Motor',
            neurons: ['DN_WALK', 'DN_FLIGHT', 'DN_TURN', 'DN_BACKUP', 'DN_STARTLE', 'VNC_CPG'],
            type: 'Motor',
            collectMNPrefix: true,
            explanation: 'El cordón nervioso ventral (VNC) es el equivalente a la médula espinal de la mosca. Contiene neuronas Motoras que controlan las patas, alas, proboscida y abdomen, además de generadores de patrones Centrales que coordinan movimientos rítmicos como caminar.',
            analogy: 'Como tu médula espinal — transmite comandos del cerebro a los músculos y coordina movimientos repetitivos como caminar.',
            interaction: 'Observa cómo se activan las neuronas Motoras durante cualquier comportamiento — caminar enciende los Motores de las patas, volar enciende los Motores de las alas.',
            populationEstimate: '~15,000 neuronas incluyendo neuronas Motoras e interneuronas'
        },
        {
            id: 'thermoSensorial',
            name: 'Termosensorial',
            neurons: ['THERMO_WARM', 'THERMO_COOL'],
            type: 'Sensorial',
            explanation: 'Las neuronas termosensoriales detectan cambios de temperatura. Los sensores de calor y frío reportan al cerebro para que la mosca busque temperaturas confortables.',
            analogy: 'Como los sensores de temperatura en tu piel — le dicen al cerebro si hace demasiado calor o demasiado frío.',
            interaction: 'Cambia la configuración de Temp a Cálido o Frío y observa cómo se activan las neuronas termosensoriales correspondientes.',
            populationEstimate: '~60 neuronas'
        },
        {
            id: 'mechanoSensorial',
            name: 'Mecanosensorial',
            neurons: ['MECH_BRISTLE', 'MECH_JO', 'MECH_CHORD', 'ANTENNAL_MECH', 'NOCI'],
            type: 'Sensorial',
            explanation: 'Las neuronas mecanosensoriales detectan tacto, viento, gravedad y posición corporal. Las neuronas cerdas responden al contacto físico, el órgano de Johnston detecta viento y gravedad a través de las antenas, y los órganos cordotonal rastrean las posiciones de las extremidades.',
            analogy: 'Como tu sentido del tacto combinado con el sistema de equilibrio de tu oído interno.',
            interaction: 'Toca la mosca para activar las neuronas cerdas. Sopla aire para activar el órgano de Johnston.',
            populationEstimate: '~2,500 neuronas'
        },
        {
            id: 'Impulsos',
            name: 'Impulsos',
            neurons: ['DRIVE_HUNGER', 'DRIVE_FEAR', 'DRIVE_FATIGUE', 'DRIVE_CURIOSITY', 'DRIVE_GROOM'],
            type: 'Impulsos',
            explanation: 'Las neuronas de impulso representan estados motivacionales internos. Fluctúan con el tiempo y sesgan el comportamiento de la mosca — una mosca hambrienta busca comida, una mosca asustada huye, una mosca cansada descansa.',
            analogy: 'Como tus propios sentimientos de hambre, ansiedad o cansancio — estados internos invisibles que dan forma a lo que haces a continuación.',
            interaction: 'Observa los metros de impulso en el panel inferior. El hambre aumenta con el tiempo; el miedo se dispara cuando tocas o soplas aire a la mosca.',
            populationEstimate: 'Distribuidas — modeladas como 5 grupos funcionales'
        }
    ];

    window.EducationPanel = {
        active: false,
        _initialized: false,
        _panel: null,
        _content: null,

        init: function () {
            EducationPanel._panel = document.getElementById('education-panel');
            var closeBtn = document.getElementById('education-close-btn');
            closeBtn.textContent = '×';
            closeBtn.addEventListener('click', function () {
                EducationPanel.hide();
                var learnBtnEl = document.getElementById('learnBtn');
                if (learnBtnEl) learnBtnEl.classList.remove('active');
            });
            EducationPanel._content = document.getElementById('education-content');
            EducationPanel._buildContent();
            EducationPanel._initialized = true;
        },

        _buildContent: function () {
            var html = '';

            html += '<p class="edu-text" style="margin-bottom:1rem;">Un modelo funcional simplificado del cerebro de la mosca de la fruta. 59 grupos de neuronas modelan ~130,000 neuronas reales mapeadas por FlyWire (2024).</p>';

            var types = [
                { key: 'Sensorial', label: 'Sensorial', color: '#3b82f6' },
                { key: 'Central', label: 'Central', color: '#8b5cf6' },
                { key: 'Impulsos', label: 'Impulsos', color: '#f59e0b' },
                { key: 'Motor', label: 'Motor', color: '#ef4444' }
            ];

            html += '<div class="edu-columns">';
            for (var t = 0; t < types.length; t++) {
                var type = types[t];
                html += '<div class="edu-column">';
                html += '<div class="edu-column-header edu-type-' + type.key + '">' + type.label + '</div>';
                for (var i = 0; i < EDUCATION_REGIONS.length; i++) {
                    var region = EDUCATION_REGIONS[i];
                    if (region.type !== type.key) continue;
                    html += '<div class="edu-region-card" data-region-id="' + region.id + '">';
                    html += '<span class="edu-region-link" data-region="' + region.name + '">' + region.name + '</span>';
                    html += '</div>';
                }
                html += '</div>';
            }
            html += '</div>';

            // Signal flow diagram
            html += '<div class="edu-section" style="margin-top:1rem;">';
            html += '<h2 class="edu-section-title">Flujo de Señal</h2>';
            html += '<svg class="edu-signal-flow" viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg">';
            html += '<defs>';
            html += '<marker id="edu-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8892a4"/></marker>';
            html += '<marker id="edu-arrow-Impulsos" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b"/></marker>';
            html += '</defs>';
            html += '<rect x="20" y="60" width="140" height="80" rx="8" fill="rgba(59,130,246,0.2)" stroke="#3b82f6"/>';
            html += '<text x="90" y="105" text-anchor="middle" fill="white" font-size="14">Sensorial</text>';
            html += '<rect x="230" y="40" width="140" height="120" rx="8" fill="rgba(139,92,246,0.2)" stroke="#8b5cf6"/>';
            html += '<text x="300" y="105" text-anchor="middle" fill="white" font-size="14">Central</text>';
            html += '<rect x="440" y="60" width="140" height="80" rx="8" fill="rgba(239,68,68,0.2)" stroke="#ef4444"/>';
            html += '<text x="510" y="105" text-anchor="middle" fill="white" font-size="14">Motor</text>';
            html += '<line x1="160" y1="100" x2="230" y2="100" stroke="#8892a4" stroke-width="2" marker-end="url(#edu-arrow)"/>';
            html += '<line x1="370" y1="100" x2="440" y2="100" stroke="#8892a4" stroke-width="2" marker-end="url(#edu-arrow)"/>';
            html += '<rect x="250" y="175" width="100" height="25" rx="4" fill="rgba(245,158,11,0.2)" stroke="#f59e0b"/>';
            html += '<text x="300" y="192" text-anchor="middle" fill="white" font-size="12">Impulsos</text>';
            html += '<line x1="300" y1="175" x2="300" y2="160" stroke="#f59e0b" stroke-dasharray="4,3" stroke-width="2" marker-end="url(#edu-arrow-Impulsos)"/>';
            html += '</svg>';
            html += '</div>';

            html += '<div id="edu-detail" class="edu-detail-panel" style="display:none;"></div>';

            html += '<div class="edu-section">';
            html += '<h2 class="edu-section-title">¿Qué está simplificado?</h2>';
            html += '<ul class="edu-list">';
            html += '<li>Cada grupo = cientos/miles de neuronas reales</li>';
            html += '<li>Los pesos de conexión son estimaciones, no cantidades exactas</li>';
            html += '<li>Sin plasticidad sináptica (los pesos son fijos)</li>';
            html += '<li>Sin difusión de neuromoduladores ni uniones gap</li>';
            html += '</ul>';
            html += '</div>';

            html += '<div class="edu-section">';
            html += '<h2 class="edu-section-title">Aprender más</h2>';
            html += '<ul class="edu-links">';
            html += '<li><a href="https://codex.flywire.ai" target="_blank" rel="noopener noreferrer">FlyWire Codex</a></li>';
            html += '<li><a href="https://doi.org/10.1038/s41586-024-07558-y" target="_blank" rel="noopener noreferrer">Dorkenwald et al. 2024</a></li>';
            html += '<li><a href="https://www.virtualflybrain.org" target="_blank" rel="noopener noreferrer">Virtual Fly Cerebro</a></li>';
            html += '</ul>';
            html += '</div>';

            EducationPanel._content.innerHTML = html;

            var cards = EducationPanel._content.querySelectorAll('.edu-region-card');
            for (var ci = 0; ci < cards.length; ci++) {
                (function (card) {
                    card.addEventListener('click', function () {
                        var regionId = card.getAttribute('data-region-id');
                        for (var r = 0; r < EDUCATION_REGIONS.length; r++) {
                            if (EDUCATION_REGIONS[r].id === regionId) {
                                EducationPanel._showDetail(EDUCATION_REGIONS[r]);
                                EducationPanel.highlightRegion(EDUCATION_REGIONS[r].name);
                                break;
                            }
                        }
                    });
                })(cards[ci]);
            }
        },

        _showDetail: function (region) {
            var detail = document.getElementById('edu-detail');
            if (!detail) return;
            var html = '<div class="edu-section">';
            html += '<h2 class="edu-section-title"><span class="edu-region-link" data-region="' + region.name + '">' + region.name + '</span><span class="edu-type-badge edu-type-' + region.type + '">' + region.type + '</span></h2>';
            html += '<p class="edu-text">' + region.explanation + '</p>';
            html += '<p class="edu-analogy"><strong>Analogía:</strong> ' + region.analogy + '</p>';
            html += '<p class="edu-interaction"><strong>Pruébalo:</strong> ' + region.interaction + '</p>';
            html += '<div class="edu-neuron-list"><strong>Grupos de neuronas:</strong>';
            for (var j = 0; j < region.neurons.length; j++) {
                html += '<span class="edu-neuron-tag">' + region.neurons[j] + '</span>';
            }
            if (region.collectMNPrefix && typeof BRAIN !== 'undefined' && BRAIN.postSynaptic) {
                var keys = Object.keys(BRAIN.postSynaptic);
                for (var k = 0; k < keys.length; k++) {
                    if (keys[k].indexOf('MN_') === 0 && region.neurons.indexOf(keys[k]) === -1) {
                        html += '<span class="edu-neuron-tag">' + keys[k] + '</span>';
                    }
                }
            }
            html += '</div>';
            html += '<div class="edu-population">' + region.populationEstimate + '</div>';
            html += '</div>';
            detail.innerHTML = html;
            detail.style.display = 'block';
        },

        highlightRegion: function (regionName) {
            if (typeof Cerebro3D !== 'undefined' && Cerebro3D.highlightRegion) {
                Cerebro3D.highlightRegion(regionName);
            }
        },

        show: function () {
            if (!EducationPanel._initialized) EducationPanel.init();
            EducationPanel._panel.style.display = 'flex';
            EducationPanel.active = true;
        },

        hide: function () {
            EducationPanel._panel.style.display = 'none';
            EducationPanel.active = false;
        },

        toggle: function () {
            if (EducationPanel.active) {
                EducationPanel.hide();
            } else {
                EducationPanel.show();
            }
        }
    };
})();
