const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const playerHealthEl = document.getElementById("playerHealth");
const botHealthEl = document.getElementById("botHealth");
const playerHpText = document.getElementById("playerHpText");
const botHpText = document.getElementById("botHpText");
const roundText = document.getElementById("roundText");
const specialText = document.getElementById("specialText");

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const restartBtn = document.getElementById("restartBtn");

const imagePaths = [
  "assets/fighter1.png",
  "assets/fighter2.png",
  "assets/fighter3.png",
  "assets/fighter4.png",
  "assets/fighter5.png",
  "assets/fighter6.png"
];

const keys = {};
const fighterImages = [];

const GRAVITY = 0.75;
const FLOOR_Y = 445;

let player;
let bot;

let currentRound = 1;
let gameState = "playing";
let selectedPlayerIndex = 0;
let botOrder = [1, 2, 3, 4, 5];
let attackEffects = [];
let screenShake = 0;
let loopStarted = false;

function loadImages() {
  return Promise.all(
    imagePaths.map((src, index) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = src;

        img.onload = () => {
          fighterImages[index] = img;
          resolve(img);
        };

        img.onerror = () => {
          console.warn("Image not found:", src);
          fighterImages[index] = null;
          resolve(null);
        };
      });
    })
  );
}

class Fighter {
  constructor(config) {
    this.name = config.name;
    this.x = config.x;
    this.y = config.y;
    this.width = 105;
    this.height = 190;
    this.image = config.image || null;

    this.vx = 0;
    this.vy = 0;
    this.speed = config.speed || 4;
    this.jumpPower = 15;

    this.maxHp = config.maxHp || 100;
    this.hp = this.maxHp;
    this.damageMultiplier = config.damageMultiplier || 1;

    this.facing = config.facing || 1;
    this.isGrounded = false;
    this.isBlocking = false;
    this.isAttacking = false;

    this.hitFlash = 0;
    this.stun = 0;

    this.punchCooldown = 0;
    this.kickCooldown = 0;
    this.specialCooldown = 0;

    this.aiTimer = 0;
    this.retreatTimer = 0;
    this.blockTimer = 0;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += GRAVITY;

    if (this.y + this.height >= FLOOR_Y) {
      this.y = FLOOR_Y - this.height;
      this.vy = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
    }

    this.x = Math.max(20, Math.min(canvas.width - this.width - 20, this.x));

    this.punchCooldown = Math.max(0, this.punchCooldown - 1);
    this.kickCooldown = Math.max(0, this.kickCooldown - 1);
    this.specialCooldown = Math.max(0, this.specialCooldown - 1);
    this.hitFlash = Math.max(0, this.hitFlash - 1);
    this.stun = Math.max(0, this.stun - 1);

    if (this.blockTimer > 0) {
      this.blockTimer--;
      this.isBlocking = true;
    }
  }

  draw() {
    ctx.save();

    if (this.hitFlash > 0) {
      ctx.globalAlpha = 0.45 + Math.random() * 0.35;
    }

    if (this.isBlocking) {
      ctx.fillStyle = "rgba(80, 180, 255, 0.2)";
      ctx.fillRect(this.x - 8, this.y - 8, this.width + 16, this.height + 16);
    }

    const lean = this.isAttacking ? this.facing * 8 : 0;

    ctx.translate(this.x + this.width / 2 + lean, this.y + this.height / 2);
    ctx.scale(this.facing, 1);

    if (this.image) {
      ctx.drawImage(
        this.image,
        -this.width / 2,
        -this.height / 2,
        this.width,
        this.height
      );
    } else {
      ctx.fillStyle = this.name === "Player" ? "#27f2a1" : "#ff4166";
      ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
    }

    ctx.restore();

    if (this.isBlocking) {
      ctx.save();
      ctx.strokeStyle = "rgba(95, 190, 255, 0.75)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(
        this.x + this.width / 2,
        this.y + this.height / 2,
        78,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
    }
  }

  jump() {
    if (this.isGrounded) {
      this.vy = -this.jumpPower;
      this.isGrounded = false;
    }
  }

  getBodyBox() {
    return {
      x: this.x + 18,
      y: this.y + 18,
      width: this.width - 36,
      height: this.height - 20
    };
  }

  getAttackHitbox(range, height) {
    return {
      x: this.facing === 1 ? this.x + this.width - 8 : this.x - range + 8,
      y: this.y + this.height * 0.38,
      width: range,
      height
    };
  }

  punch(target) {
    if (this.punchCooldown > 0 || this.stun > 0) return;

    this.isAttacking = true;
    this.punchCooldown = 28;

    setTimeout(() => {
      this.isAttacking = false;
    }, 150);

    const hitbox = this.getAttackHitbox(75, 70);
    createAttackEffect(hitbox, "punch");

    if (rectsOverlap(hitbox, target.getBodyBox())) {
      target.takeDamage(8 * this.damageMultiplier, this);
    }
  }

  kick(target) {
    if (this.kickCooldown > 0 || this.stun > 0) return;

    this.isAttacking = true;
    this.kickCooldown = 42;

    setTimeout(() => {
      this.isAttacking = false;
    }, 200);

    const hitbox = this.getAttackHitbox(115, 70);
    createAttackEffect(hitbox, "kick");

    if (rectsOverlap(hitbox, target.getBodyBox())) {
      target.takeDamage(13 * this.damageMultiplier, this);
    }
  }

  special(target) {
    if (this.specialCooldown > 0 || this.stun > 0) return;

    this.isAttacking = true;
    this.specialCooldown = 270;
    screenShake = 14;

    setTimeout(() => {
      this.isAttacking = false;
    }, 260);

    const hitbox = this.getAttackHitbox(170, 95);
    createAttackEffect(hitbox, "special");

    if (rectsOverlap(hitbox, target.getBodyBox())) {
      target.takeDamage(24 * this.damageMultiplier, this);
    }
  }

  takeDamage(amount, attacker) {
    let finalDamage = amount;

    if (this.isBlocking) {
      finalDamage *= 0.35;
    }

    this.hp = Math.max(0, this.hp - finalDamage);
    this.hitFlash = 10;
    this.stun = this.isBlocking ? 3 : 9;

    this.vx = this.x < attacker.x ? -7 : 7;
    this.vy = Math.min(this.vy, -4);

    screenShake = 8;

    setTimeout(() => {
      this.vx *= 0.1;
    }, 120);
  }
}

function buildBotOrder() {
  botOrder = imagePaths.map((_, index) => index).filter(index => index !== selectedPlayerIndex);
}

function createPlayer() {
  player = new Fighter({
    name: "Player",
    x: 150,
    y: FLOOR_Y - 190,
    image: fighterImages[selectedPlayerIndex],
    maxHp: 100,
    damageMultiplier: 1,
    speed: 5,
    facing: 1
  });
}

function createBot(round) {
  const botIndex = botOrder[round - 1] ?? 1;

  bot = new Fighter({
    name: "Bot",
    x: 700,
    y: FLOOR_Y - 190,
    image: fighterImages[botIndex],
    maxHp: 85 + round * 20,
    damageMultiplier: 0.85 + round * 0.16,
    speed: 2.8 + round * 0.2,
    facing: -1
  });
}

function createFighterSelect() {
  let fighterSelect = document.getElementById("fighterSelect");

  if (!fighterSelect) {
    const characterSection = document.querySelector(".character-select");

    fighterSelect = document.createElement("div");
    fighterSelect.id = "fighterSelect";
    fighterSelect.className = "fighter-select-grid";

    if (characterSection) {
      characterSection.appendChild(fighterSelect);
    } else {
      document.body.prepend(fighterSelect);
    }
  }

  fighterSelect.innerHTML = "";

  imagePaths.forEach((src, index) => {
    const button = document.createElement("button");
    button.className = "fighter-card";

    if (index === selectedPlayerIndex) {
      button.classList.add("active");
    }

    button.innerHTML = `
      <img src="${src}" alt="Fighter ${index + 1}">
      <span>Fighter ${index + 1}</span>
    `;

    button.addEventListener("click", () => {
      selectedPlayerIndex = index;
      buildBotOrder();
      createFighterSelect();
      restartGame();
    });

    fighterSelect.appendChild(button);
  });
}

function handlePlayerInput() {
  if (gameState !== "playing") return;

  player.vx = 0;

  if (keys["a"]) {
    player.vx = -player.speed;
    player.facing = -1;
  }

  if (keys["d"]) {
    player.vx = player.speed;
    player.facing = 1;
  }

  if (keys["w"]) {
    player.jump();
  }

  player.isBlocking = keys["l"] && player.isGrounded;

  if (keys["j"]) {
    player.punch(bot);
  }

  if (keys["k"]) {
    player.kick(bot);
  }

  if (keys[" "]) {
    player.special(bot);
  }
}

function updateBotAI() {
  if (gameState !== "playing" || !bot || bot.hp <= 0) return;

  const distance = Math.abs(player.x - bot.x);
  bot.facing = player.x > bot.x ? 1 : -1;

  bot.aiTimer--;

  if (bot.hp < bot.maxHp * 0.28 && bot.retreatTimer <= 0 && Math.random() < 0.03) {
    bot.retreatTimer = 70;
  }

  if (bot.retreatTimer > 0) {
    bot.retreatTimer--;
    bot.vx = bot.x < player.x ? -bot.speed : bot.speed;
    bot.isBlocking = Math.random() < 0.45;
    return;
  }

  bot.isBlocking = false;

  if (distance > 145) {
    bot.vx = player.x > bot.x ? bot.speed : -bot.speed;
  } else {
    bot.vx = 0;

    if (Math.random() < 0.018) {
      bot.blockTimer = 35;
    }

    if (!bot.isBlocking && bot.aiTimer <= 0) {
      const choice = Math.random();

      if (choice < 0.55) {
        bot.punch(player);
        bot.aiTimer = 48;
      } else if (choice < 0.9) {
        bot.kick(player);
        bot.aiTimer = 65;
      } else {
        bot.special(player);
        bot.aiTimer = 120;
      }
    }
  }

  if (distance > 260 && bot.isGrounded && Math.random() < 0.01) {
    bot.jump();
  }
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function createAttackEffect(box, type) {
  attackEffects.push({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    life: type === "special" ? 18 : 10,
    maxLife: type === "special" ? 18 : 10,
    type
  });
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#090915");
  gradient.addColorStop(0.55, "#111124");
  gradient.addColorStop(1, "#050508");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(100, 140, 255, 0.18)";
  ctx.lineWidth = 1;

  for (let x = 0; x < canvas.width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - 150, canvas.height);
    ctx.stroke();
  }

  for (let y = 70; y < canvas.height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(115, 87, 255, 0.16)";
  ctx.fillRect(0, FLOOR_Y, canvas.width, canvas.height - FLOOR_Y);

  ctx.fillStyle = "#171722";
  ctx.fillRect(0, FLOOR_Y, canvas.width, 8);

  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(0, FLOOR_Y + 8, canvas.width, 2);
}

function drawAttackEffects() {
  attackEffects = attackEffects.filter(effect => effect.life > 0);

  for (const effect of attackEffects) {
    const alpha = effect.life / effect.maxLife;

    if (effect.type === "special") {
      ctx.fillStyle = `rgba(158, 116, 255, ${alpha * 0.45})`;
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    } else if (effect.type === "kick") {
      ctx.fillStyle = `rgba(255, 210, 80, ${alpha * 0.35})`;
      ctx.strokeStyle = `rgba(255, 230, 140, ${alpha})`;
    } else {
      ctx.fillStyle = `rgba(70, 220, 255, ${alpha * 0.35})`;
      ctx.strokeStyle = `rgba(150, 240, 255, ${alpha})`;
    }

    ctx.lineWidth = 2;
    ctx.fillRect(effect.x, effect.y, effect.width, effect.height);
    ctx.strokeRect(effect.x, effect.y, effect.width, effect.height);

    effect.life--;
  }
}

function drawNameTag(fighter, text) {
  ctx.save();

  const x = fighter.x + fighter.width / 2;
  const y = fighter.y - 12;

  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(x - 38, y - 18, 76, 23);

  ctx.font = "bold 14px Arial";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y - 2);

  ctx.restore();
}

function updateHUD() {
  if (!player || !bot) return;

  const playerPercent = Math.max(0, player.hp / player.maxHp) * 100;
  const botPercent = Math.max(0, bot.hp / bot.maxHp) * 100;

  playerHealthEl.style.width = `${playerPercent}%`;
  botHealthEl.style.width = `${botPercent}%`;

  playerHpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
  botHpText.textContent = `${Math.ceil(bot.hp)} / ${bot.maxHp}`;

  roundText.textContent = `Round ${currentRound} / ${botOrder.length}`;

  if (player.specialCooldown <= 0) {
    specialText.textContent = "Special Ready";
    specialText.style.color = "#ffd36a";
  } else {
    specialText.textContent = `Special: ${Math.ceil(player.specialCooldown / 60)}s`;
    specialText.style.color = "#b9bbd8";
  }
}

function checkGameStatus() {
  if (player.hp <= 0 && gameState === "playing") {
    endGame(false);
  }

  if (bot.hp <= 0 && gameState === "playing") {
    if (currentRound >= botOrder.length) {
      endGame(true);
    } else {
      gameState = "transition";

      setTimeout(() => {
        currentRound++;
        createBot(currentRound);
        player.hp = Math.min(player.maxHp, player.hp + 25);
        gameState = "playing";
      }, 650);
    }
  }
}

function endGame(playerWon) {
  gameState = "ended";

  overlay.classList.remove("hidden");

  if (playerWon) {
    overlayTitle.textContent = "Victory!";
    overlayText.textContent = "You defeated all bot fighters in the Voxel Arena.";
  } else {
    overlayTitle.textContent = "Game Over";
    overlayText.textContent = "You were defeated. Restart and run it back.";
  }
}

function restartGame() {
  currentRound = 1;
  attackEffects = [];
  screenShake = 0;
  gameState = "playing";

  if (overlay) {
    overlay.classList.add("hidden");
  }

  createPlayer();
  createBot(currentRound);
  updateHUD();
}

function gameLoop() {
  ctx.save();

  if (screenShake > 0) {
    ctx.translate(
      (Math.random() - 0.5) * screenShake,
      (Math.random() - 0.5) * screenShake
    );

    screenShake *= 0.86;

    if (screenShake < 0.6) {
      screenShake = 0;
    }
  }

  drawBackground();

  if (player && bot) {
    if (gameState === "playing") {
      handlePlayerInput();
      updateBotAI();

      player.update();
      bot.update();

      if (player.x < bot.x) {
        if (player.vx === 0) player.facing = 1;
        bot.facing = -1;
      } else {
        if (player.vx === 0) player.facing = -1;
        bot.facing = 1;
      }

      checkGameStatus();
    }

    drawAttackEffects();

    if (player.y < bot.y) {
      player.draw();
      bot.draw();
    } else {
      bot.draw();
      player.draw();
    }

    drawNameTag(player, "YOU");
    drawNameTag(bot, `BOT ${currentRound}`);

    updateHUD();
  }

  ctx.restore();

  requestAnimationFrame(gameLoop);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (["a", "d", "w", "j", "k", "l", " "].includes(key)) {
    event.preventDefault();
  }

  keys[key] = true;
});

window.addEventListener("keyup", (event) => {
  keys[event.key.toLowerCase()] = false;
});

document.querySelectorAll(".mobile-controls button").forEach((button) => {
  const key = button.dataset.key;

  button.addEventListener("touchstart", (event) => {
    event.preventDefault();
    keys[key] = true;
  });

  button.addEventListener("touchend", (event) => {
    event.preventDefault();
    keys[key] = false;
  });

  button.addEventListener("mousedown", () => {
    keys[key] = true;
  });

  button.addEventListener("mouseup", () => {
    keys[key] = false;
  });

  button.addEventListener("mouseleave", () => {
    keys[key] = false;
  });
});

if (restartBtn) {
  restartBtn.addEventListener("click", restartGame);
}

loadImages().then(() => {
  buildBotOrder();
  createFighterSelect();
  restartGame();

  if (!loopStarted) {
    loopStarted = true;
    gameLoop();
  }
});
