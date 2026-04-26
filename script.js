const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('canvas-container');
const displayEl = document.getElementById('custom-display');
const messageArea = document.getElementById('message-area');

let isGameRunning = false;
let playerName = "";
let score = 0;
let lives = 3;
let level = 1;
let asteroidsDestroyed = 0;

// Motor del Juego
let asteroidSpawnRate = 5500; 
let baseAsteroidSpeed = 0.3;  
let asteroids = [];
let lasers = [];
let explosionParticles = [];
let selectedAsteroid = null; 
let lastSpawnTime = 0;
let gameLoopId;
let completedFactorizations = [];

let currentInputStr = "";
let autoShootTimer = null;

const colors = {
    asteroidBase: '#555', asteroidText: '#fff', laser: '#00ff00',
    explosion: '#00ffff', ship: '#00ffff', target: '#ff00ff' 
};

// --- MOTOR DE AUDIO ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playSound(type) {
    if (!audioCtx) return;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'laser') {
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(880, now);
        oscillator.frequency.exponentialRampToValueAtTime(110, now + 0.1);
        gainNode.gain.setValueAtTime(0.05, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        oscillator.start(now);
        oscillator.stop(now + 0.1);
    } else if (type === 'hit') {
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(300, now);
        oscillator.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        oscillator.start(now);
        oscillator.stop(now + 0.1);
    } else if (type === 'explosion') {
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(150, now);
        oscillator.frequency.exponentialRampToValueAtTime(10, now + 0.4);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        oscillator.start(now);
        oscillator.stop(now + 0.4);
    } else if (type === 'error') {
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(150, now);
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.linearRampToValueAtTime(0.001, now + 0.2);
        oscillator.start(now);
        oscillator.stop(now + 0.2);
    } else if (type === 'levelUp') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, now);
        oscillator.frequency.setValueAtTime(554, now + 0.1);
        oscillator.frequency.setValueAtTime(659, now + 0.2);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.4);
        oscillator.start(now);
        oscillator.stop(now + 0.4);
    }
}
// ---------------------------------------------

function typeNum(char) {
    if (!isGameRunning) return;
    if (currentInputStr.length < 4) { 
        currentInputStr += char;
        updateDisplay();
        messageArea.textContent = ""; 
        
        clearTimeout(autoShootTimer); 
        autoShootTimer = setTimeout(() => {
            if (currentInputStr !== "") {
                handleShoot();
            }
        }, 600); 
    }
}

function clearNum() {
    if (!isGameRunning) return;
    currentInputStr = "";
    clearTimeout(autoShootTimer); 
    updateDisplay();
}

function updateDisplay() {
    if (currentInputStr === "") {
        displayEl.textContent = "?";
        displayEl.classList.remove('display-active');
    } else {
        displayEl.textContent = currentInputStr;
        displayEl.classList.add('display-active');
    }
}

window.addEventListener('keydown', (e) => {
    if (!isGameRunning) return;
    if (e.key >= '0' && e.key <= '9') typeNum(e.key);
    if (e.key === 'Backspace' || e.key === 'Escape' || e.key.toLowerCase() === 'c') clearNum();
    if (e.key === 'Enter') handleShoot();
});

const RANKING_KEY = 'factorization_game_ranking';

function getRanking() {
    const data = localStorage.getItem(RANKING_KEY);
    return data ? JSON.parse(data) : [];
}

function saveToRanking(name, finalScore, finalLevel) {
    let ranking = getRanking();
    ranking.push({ name: name, score: finalScore, level: finalLevel });
    ranking.sort((a, b) => b.score - a.score);
    ranking = ranking.slice(0, 5);
    localStorage.setItem(RANKING_KEY, JSON.stringify(ranking));
}

function renderRanking(elementId) {
    const ranking = getRanking();
    const listElement = document.getElementById(elementId);
    listElement.innerHTML = ''; 
    if (ranking.length === 0) {
        listElement.innerHTML = '<li style="color:#aaa; justify-content:center;">Aún no hay registros</li>';
        return;
    }
    ranking.forEach((entry, index) => {
        let medal = "🔹";
        if(index === 0) medal = "🥇";
        if(index === 1) medal = "🥈";
        if(index === 2) medal = "🥉";
        const li = document.createElement('li');
        li.innerHTML = `<span>${medal} <span class="rank-name">${entry.name}</span></span> <span class="rank-score">${entry.score} pts (Nv ${entry.level})</span>`;
        listElement.appendChild(li);
    });
}

function clearRanking() {
    if(confirm("¿Seguro que quieres borrar todo el historial?")) {
        localStorage.removeItem(RANKING_KEY);
        renderRanking('start-ranking-list');
    }
}

window.onload = () => renderRanking('start-ranking-list');

function resizeCanvas() {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
}
window.addEventListener('resize', resizeCanvas);

document.getElementById('start-button').addEventListener('click', function() {
    initAudio(); 
    playerName = document.getElementById('player-name-input').value.trim();
    if (playerName === "") playerName = "Piloto";
    document.getElementById('player-name-display').textContent = playerName;
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('game-outer-container').style.display = 'flex';
    resizeCanvas(); 
    startGame();
});

function handleTargeting(e) {
    if (!isGameRunning) return;
    e.preventDefault(); 
    const rect = canvas.getBoundingClientRect();
    let clientX = e.clientX;
    let clientY = e.clientY;
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    }
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    for(let i = 0; i < asteroids.length; i++) {
        let a = asteroids[i];
        const dist = Math.hypot(a.x - mouseX, a.y - mouseY);
        if(dist < Math.max(30, a.radius) + 25) { 
            selectedAsteroid = a;
            showMessage("¡Blanco fijado!", true);
            return;
        }
    }
    selectedAsteroid = null;
}

canvas.addEventListener('mousedown', handleTargeting);
canvas.addEventListener('touchstart', handleTargeting, {passive: false});

function startGame() {
    isGameRunning = true;
    score = 0; lives = 3; level = 1; asteroidsDestroyed = 0;
    baseAsteroidSpeed = 0.3; asteroidSpawnRate = 5500; 
    asteroids = []; lasers = []; completedFactorizations = []; 
    selectedAsteroid = null;
    clearNum();
    updateHUD();
    lastSpawnTime = 0; 
    gameLoop();
    if (window.AppInventor) {
    window.AppInventor.setWebViewString("inicio");
}
}

function goToStartScreen() {
    document.getElementById('game-over-overlay').style.display = 'none';
    document.getElementById('game-outer-container').style.display = 'none';
    document.getElementById('start-screen').style.display = 'flex';
    renderRanking('start-ranking-list');
}

function formatFactorization(num, factors) {
    factors.sort((a, b) => a - b);
    let expanded = factors.join(' . '); 
    let counts = {};
    factors.forEach(f => counts[f] = (counts[f] || 0) + 1);
    let exponentialParts = [];
    for (let f in counts) {
        if (counts[f] > 1) exponentialParts.push(`${f}<sup>${counts[f]}</sup>`);
        else exponentialParts.push(`${f}`);
    }
    let exponential = exponentialParts.join(' . ');
    if (expanded === exponential) return `<b>${num}</b> = ${expanded}`;
    return `<b>${num}</b> = ${expanded} = ${exponential}`;
}

function endGame() {
    isGameRunning = false;
    clearTimeout(autoShootTimer); 
    cancelAnimationFrame(gameLoopId);
    saveToRanking(playerName, score, level);
    document.getElementById('final-score').textContent = `Puntaje: ${score} | Nivel: ${level}`;

    let resultsHTML = "<h3 style='margin-top:0; color:#00ff00; font-size:16px;'>Tu Reporte:</h3><ul style='margin:0; padding-left: 20px;'>";
    if (completedFactorizations.length === 0) resultsHTML += "<li>Ningún asteroide destruido.</li>";
    else {
        completedFactorizations.forEach(item => {
            resultsHTML += `<li>${formatFactorization(item.original, item.factors)}</li>`;
        });
    }
    resultsHTML += "</ul>";
    document.getElementById('factorization-results').innerHTML = resultsHTML;
    renderRanking('end-ranking-list');
    document.getElementById('game-over-overlay').style.display = 'flex';

    const date = new Date().toLocaleDateString('es-AR');
    document.getElementById('print-area').innerHTML = `
        <div style="max-width: 800px; margin: 0 auto;">
            <h1>Factorización Prima - Reporte</h1>
            <p><strong>Piloto:</strong> ${playerName} | <strong>Fecha:</strong> ${date} | <strong>Puntos:</strong> ${score}</p>
            <hr style="border: 1px solid #ccc;">
            <h2>Descomposiciones:</h2>${resultsHTML}
        </div>
    `;
}

function isPrime(num) {
    if (num <= 1) return false;
    if (num <= 3) return true;
    if (num % 2 === 0 || num % 3 === 0) return false;
    for (let i = 5; i * i <= num; i += 6) {
        if (num % i === 0 || num % (i + 2) === 0) return false;
    }
    return true;
}

// --- NUEVA LÓGICA DE GENERACIÓN DE NÚMEROS ---
function generateLevelNumber() {
    let numFactors;
    let availablePrimes = [];

    // Al construir los números multiplicando primos, garantizamos muchas divisiones.
    if (level <= 2) {
        numFactors = Math.floor(Math.random() * 2) + 3; // 3 o 4 factores (ej: 2*2*3 = 12)
        availablePrimes = [2, 2, 2, 3, 3, 5]; 
    } else if (level <= 4) {
        numFactors = Math.floor(Math.random() * 2) + 4; // 4 o 5 factores 
        availablePrimes = [2, 2, 3, 3, 5, 7]; 
    } else {
        numFactors = Math.floor(Math.random() * 2) + 4; // Escala hacia 3 cifras de manera segura
        availablePrimes = [2, 3, 3, 5, 7, 11]; 
    }

    let num = 1;
    for (let i = 0; i < numFactors; i++) {
        let randomPrime = availablePrimes[Math.floor(Math.random() * availablePrimes.length)];
        num *= randomPrime;
    }

    // Filtro de seguridad: mínimo 20, máximo 1500
    if (num < 20 || num > 1500) {
        return generateLevelNumber();
    }

    return num;
}

function generateAsteroidOffsets(vertices) {
    let offsets = [];
    for(let i=0; i<vertices; i++) offsets.push((Math.random() - 0.5) * 12);
    return offsets;
}

function handleShoot() {
    if (!isGameRunning) return;
    
    clearTimeout(autoShootTimer); 

    const divisor = parseInt(currentInputStr);
    
    clearNum(); 

    if (isNaN(divisor)) {
        playSound('error');
        showMessage("Ingresa un número", false);
        if (window.AppInventor) window.AppInventor.setWebViewString("error");
        return;
    }

    if (divisor === 1) {
        playSound('error');
        showMessage("El 1 no es primo ni compuesto. ¡Intenta con otro!", false);
        if (window.AppInventor) window.AppInventor.setWebViewString("error");
        return; 
    }

    if (!selectedAsteroid || !asteroids.includes(selectedAsteroid)) {
        playSound('error');
        showMessage("¡Toca un asteroide para apuntar!", false);
        if (window.AppInventor) window.AppInventor.setWebViewString("error");
        return;
    }
    
    if (!isPrime(divisor)) {
        lives--;
        updateHUD();
        playSound('error');
        showMessage(`¡Error! ${divisor} es COMPUESTO. Pierdes 1 vida.`, false);
        if (window.AppInventor) window.AppInventor.setWebViewString("error");
        
        canvas.style.filter = "brightness(50%) sepia(1) hue-rotate(-50deg) saturate(500%)";
        setTimeout(() => canvas.style.filter = "none", 200);
        if (lives <= 0) {
            playSound('explosion');
            endGame();
        }
        return;
    }

    let targetAsteroid = selectedAsteroid;

    if (targetAsteroid.number % divisor === 0) {
        // --- DIVISIÓN EXITOSA ---
        playSound('laser');
        lasers.push({
            startX: canvas.width / 2, startY: canvas.height - 30, 
            targetX: targetAsteroid.x, targetY: targetAsteroid.y, life: 10
        });

        targetAsteroid.number = targetAsteroid.number / divisor;
        targetAsteroid.factors.push(divisor); 
        score += 50 * level; 
        targetAsteroid.radius = Math.max(15, targetAsteroid.radius - 3);
        
        if (targetAsteroid.number === 1) {
            playSound('explosion');
            asteroidsDestroyed++;
            createExplosion(targetAsteroid.x, targetAsteroid.y);
            completedFactorizations.push({ original: targetAsteroid.originalNumber, factors: [...targetAsteroid.factors] });
            asteroids = asteroids.filter(a => a !== targetAsteroid);
            selectedAsteroid = null; 
            score += 100 * level; 
            showMessage("¡Asteroide Destruido!", true);
            if (window.AppInventor) {
                window.AppInventor.setWebViewString("destruido");
            }
            checkLevelUp();
        } else {
            playSound('hit');
            showMessage("¡División exitosa!", true);
            if (window.AppInventor) {
                window.AppInventor.setWebViewString("acierto");
            }
        }
    } else {
        // --- DIVISOR ERRÓNEO ---
        lives--;
        updateHUD();
        playSound('error');
        showMessage(`¡Error! ${divisor} no es divisor de ${targetAsteroid.number}.`, false);
        if (window.AppInventor) window.AppInventor.setWebViewString("error");
        
        canvas.style.filter = "brightness(50%) sepia(1) hue-rotate(-50deg) saturate(500%)";
        setTimeout(() => canvas.style.filter = "none", 200);
        
        if (lives <= 0) {
            playSound('explosion');
            endGame();
        }
    }
    updateHUD();
}

function checkLevelUp() {
    if (asteroidsDestroyed > 0 && asteroidsDestroyed % 5 === 0) {
        level++;
        baseAsteroidSpeed += 0.05; 
        asteroidSpawnRate = Math.max(4000, asteroidSpawnRate - 300); 
        playSound('levelUp');
        showMessage(`¡NIVEL ${level}!`, true);
        
        // Lo metimos ADENTRO del if, para que solo avise cuando sube de nivel
        if (window.AppInventor) {
            window.AppInventor.setWebViewString("nivel_" + level);
        }
    }
}

function showMessage(msg, isSuccess) {
    messageArea.textContent = msg;
    messageArea.style.color = isSuccess === true ? '#00ff00' : '#ff3333';
    clearTimeout(messageArea.timer);
    messageArea.timer = setTimeout(() => messageArea.textContent = "", 2500);
}

function update() {
    if (Date.now() - lastSpawnTime > asteroidSpawnRate) {
        const vertices = 8 + Math.floor(Math.random() * 4);
        let num = generateLevelNumber();
        let spawnX = Math.random() * (canvas.width - 60) + 30;
        asteroids.push({
            x: spawnX, y: -50, number: num, originalNumber: num, factors: [],
            speed: baseAsteroidSpeed + (Math.random() * 0.1),
            radius: 30, vertices: vertices, offsets: generateAsteroidOffsets(vertices)
        });
        lastSpawnTime = Date.now();
    }

    asteroids.forEach(a => {
        a.y += a.speed;
        if (a.y > canvas.height + a.radius) {
            lives--;
            updateHUD();
            playSound('explosion');
            createExplosion(a.x, canvas.height, true);
            if (selectedAsteroid === a) selectedAsteroid = null;
            asteroids = asteroids.filter(ast => ast !== a);
            if (lives <= 0) endGame();
        }
    });

    lasers.forEach(l => l.life--);
    lasers = lasers.filter(l => l.life > 0);
    explosionParticles.forEach(p => { p.x += p.vx; p.y += p.vy; p.alpha -= 0.02; });
    explosionParticles = explosionParticles.filter(p => p.alpha > 0);
}

function drawShip() {
    const cx = canvas.width / 2;
    const cy = canvas.height;
    ctx.fillStyle = colors.ship;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 40); ctx.lineTo(cx - 20, cy - 10); 
    ctx.lineTo(cx, cy - 20); ctx.lineTo(cx + 20, cy - 10); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 15; ctx.shadowColor = colors.ship; ctx.fill(); ctx.shadowBlur = 0; 
    ctx.fillStyle = '#ff9900';
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 18); ctx.lineTo(cx, cy - 5 + (Math.random() * 5)); 
    ctx.lineTo(cx + 8, cy - 18); ctx.closePath(); ctx.fill();
}

function drawAsteroid(a) {
    ctx.fillStyle = colors.asteroidBase;
    ctx.beginPath();
    const angleStep = (Math.PI * 2) / a.vertices;
    for (let i = 0; i < a.vertices; i++) {
        const angle = i * angleStep;
        const dist = a.radius + a.offsets[i]; 
        const vx = a.x + Math.cos(angle) * dist;
        const vy = a.y + Math.sin(angle) * dist;
        if (i === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
    }
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#333'; ctx.stroke();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawShip();
    lasers.forEach(l => {
        ctx.strokeStyle = colors.laser; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(l.startX, l.startY); ctx.lineTo(l.targetX, l.targetY); ctx.stroke();
        ctx.shadowBlur = 10; ctx.shadowColor = colors.laser; ctx.stroke(); ctx.shadowBlur = 0;
    });
    asteroids.forEach(a => {
        drawAsteroid(a);
        if (a === selectedAsteroid) {
            ctx.strokeStyle = colors.target; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(a.x, a.y, a.radius + 10, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(a.x, a.y - a.radius - 20); ctx.lineTo(a.x, a.y - a.radius - 5);
            ctx.moveTo(a.x, a.y + a.radius + 20); ctx.lineTo(a.x, a.y + a.radius + 5);
            ctx.moveTo(a.x - a.radius - 20, a.y); ctx.lineTo(a.x - a.radius - 5, a.y);
            ctx.moveTo(a.x + a.radius + 20, a.y); ctx.lineTo(a.x + a.radius + 5, a.y);
            ctx.stroke();
        }
        ctx.fillStyle = colors.asteroidText; ctx.font = 'bold 22px Courier New';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(a.number, a.x, a.y);
    });
    explosionParticles.forEach(p => {
        ctx.globalAlpha = p.alpha; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1.0;
}

function createExplosion(x, y, isDamage = false) {
    const count = isDamage ? 40 : 20;
    const color = isDamage ? '#ff0000' : colors.explosion;
    for (let i = 0; i < count; i++) {
        explosionParticles.push({
            x: x, y: y, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10,
            size: Math.random() * 5 + 1, alpha: 1, color: color
        });
    }
}

function gameLoop() {
    if (!isGameRunning) return;
    update(); draw(); gameLoopId = requestAnimationFrame(gameLoop);
}

function updateHUD() {
    document.getElementById('score-display').textContent = score;
    document.getElementById('level-display').textContent = level;
    document.getElementById('lives-display').textContent = "❤️ ".repeat(lives);
}
