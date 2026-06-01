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

const keys = {};

const GRAVITY = 0.75;
const FLOOR_Y = 445;

let gameState = "playing";
let currentRound = 1;
let screenShake = 0;
let attackEffects = [];

let selectedPlayerIndex = 0;
let botOrder = [1, 2, 3, 4, 5];

const fighterImages = [];

const imagePaths = [
  "assets/fighter1.png",
  "assets/fighter2.png",
  "assets/fighter3.png",
  "assets/fighter4.png",
  "assets/fighter5.png",
  "assets/fighter6.png"
];

function loadImages() {
  return Promise.all(
    imagePaths.map((src) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = src;
        img.onload = () => resolve(img);
        img.onerror = () => {
          console.warn("Could not load image:", src);
          resolve(null);
        };
        fighterImages.push(img);
      });
    })
  );
}

class Fighter {
  constructor(options) {
    this.name = options.name;
    this.x = options.x;
    this.y = options.y;
    this.width = options.width || 105;
    this.height = options.height || 190;
    this.image = options.image;

    this.vx = 0;
    this.vy = 0;
    this.speed = options.speed || 4;
    this.jumpPower = options.jumpPower || 15;

    this.maxHp = options.maxHp || 100;
    this.hp = this.maxHp;
    this.damageMultiplier = options.damageMultiplier || 1;

    this.facing = options.facing || 1;
    this.isGrounded = false;
    this.isBlocking = false;
    this.isAttacking = false;
    this.attackType = null;

    this.hitFlash = 0;
    this.stun = 0;

    this.punchCooldown = 0;
    this.kickCooldown = 0;
    this.specialCooldown = 0;
    this.blockTimer = 0;

    this.aiTimer = 0;
    this.aiState = "approach";
    this.retreatTimer = 0;
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
    } else if (this.name !== "Player") {
      this.isBlocking = false;
    }
  }

  draw() {
    ctx.save();

    if (this.hitFlash > 0) {
      ctx.globalAlpha = 0.45 + Math.random() * 0.35;
    }

    if (this.isBlocking) {
      ctx.fillStyle = "rgba(80, 180, 255, 0.18)";
      ctx.fillRect(this.x - 8, this.y - 8, this.width + 16, this.height + 16);
    }

    const lean = this.isAttacking ? this.facing * 8 : 0;
    const squash = this.isGrounded ? 1 : 0.96;

    ctx.translate(this.x + this.width / 2 + lean, this.y + this.height / 2);
    ctx.scale(this.facing, squash);

    if (this.image) {
      ctx.drawImage(
        this.image,
        -this.width / 2,
        -this.height / 2,
        this.width,
        this.height
      );
    } else {
      ctx.fillStyle = this.name === "Player" ? "#65f2ff" : "#ff637d";
      ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
    }

    ctx.restore();

    if (this.isBlocking) {
      ctx.save();
      ctx.strokeStyle = "rgba(95, 190, 255, 0.7)";
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

  punch(target) {
    if (this.punchCooldown > 0 || this.stun > 0) return;

    this.attackType = "punch";
    this.isAttacking = true;
    this.punchCooldown = 28;

    setTimeout(() => {
      this.isAttacking = false;
      this.attackType = null;
    }, 160);

    const hitbox = this.getAttackHitbox(75, 70);
    createAttackEffect(hitbox, "punch");

    if (rectsOverlap(hitbox, target.getBodyBox())) {
      target.takeDamage(8 * this.damageMultiplier, this);
    }
  }

  kick(target) {
    if (this.kickCooldown > 0 || this.stun > 0) return;

    this.attackType = "kick";
    this.isAttacking = true;
    this.kickCooldown = 42;

    setTimeout(() => {
      this.isAttacking = false;
      this.attackType = null;
    }, 210);

    const hitbox = this.getAttackHitbox(110, 65);
    createAttackEffect(hitbox, "kick");

    if (rectsOverlap(hitbox, target.getBodyBox())) {
      target.takeDamage(13 * this.damageMultiplier, this);
    }
  }

  special(target) {
    if (this.specialCooldown > 0 || this.stun > 0) return;

    this.attackType = "special";
    this.isAttacking = true;
    this.specialCooldown = 270;

    setTimeout(() => {
      this.isAttacking = false;
      this.attackType = null;
    }, 280);

    const hitbox = this.getAttackHitbox(165, 95);
    createAttackEffect(hitbox, "special");
    screenShake = 14;

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
    this.stun = this.isBlocking ? 4 : 10;

    const knockback = this.x < attacker.x ? -8 : 8;
    this.vx = knockback;
    this.vy = Math.min(this.vy, -4);

    screenShake = 8;

    setTimeout(() => {
      this.vx *= 0.2;
    }, 120);
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
    const boxWidth = range;
    const boxHeight = height;

    return {
      x:
        this.facing === 1
          ? this.x + this.width - 10
          : this.x - boxWidth + 10,
      y: this.y + this.height * 0.38,
      width: boxWidth,
      height: boxHeight
    };
  }
}

let player;
let bot;

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
  const botImageIndex = botOrder[round - 1];

  bot = new Fighter({
    name: "Bot",
    x: 700,
    y: FLOOR_Y - 190,
    image: fighterImages[botImageIndex],
    maxHp: 85 + round * 20,
    damageMultiplier: 0.85 + round * 0.16,
    speed: 2.8 + round * 0.18,
    facing: -1
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
  if (gameState !== "playing") return;
  if (!bot || bot.hp <= 0) return;

  const distance = Math.abs(player.x - bot.x);
  bot.facing = player.x > bot.x ? 1 : -1;

  bot.aiTimer--;

  if (bot.hp < bot.maxHp * 0.28 && bot.retreatTimer <= 0) {
    if (Math.random() < 0.025) {
      bot.retreatTimer = 70;
    }
  }

  if (bot.retreatTimer > 0) {
    bot.retreatTimer--;
    bot.vx = bot.x < player.x ? -bot.speed : bot.speed;
    bot.isBlocking = Math.random() < 0.45;
    return;
  }

  if (distance > 145) {
    bot.vx = player.x > bot.x ? bot.speed : -bot.speed;
    bot.isBlocking = false;
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

function drawAttackEffects() {
  attackEffects = attackEffects.filter(effect => effect.life > 0);

  for (const effect of attackEffects) {
    const alpha = effect.life / effect.maxLife;

    ctx.save();

    if (effect.type === "special") {
      ctx.fillStyle = `rgba(158, 116, 255, ${alpha * 0.45})`;
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = 3;
    } else if (effect.type === "kick") {
      ctx.fillStyle = `rgba(255, 210, 80, ${alpha * 0.35})`;
      ctx.strokeStyle = `rgba(255, 230, 140, ${alpha})`;
      ctx.lineWidth = 2;
    } else {
      ctx.fillStyle = `rgba(70, 220, 255, ${alpha * 0.35})`;
      ctx.strokeStyle = `rgba(150, 240, 255, ${alpha})`;
      ctx.lineWidth = 2;
    }

    ctx.fillRect(effect.x, effect.y, effect.width, effect.height);
    ctx.strokeRect(effect.x, effect.y, effect.width, effect.height);

    ctx.restore();

    effect.life--;
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#090915");
  gradient.addColorStop(0.55, "#111124");
  gradient.addColorStop(1, "#050508");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();

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

  ctx.restore();

  ctx.fillStyle = "rgba(115, 87, 255, 0.16)";
  ctx.fillRect(0, FLOOR_Y, canvas.width, canvas.height - FLOOR_Y);

  ctx.fillStyle = "#171722";
  ctx.fillRect(0, FLOOR_Y, canvas.width, 8);

  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(0, FLOOR_Y + 8, canvas.width, 2);

  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = "#7e5cff";
  ctx.fillRect(90, 90, 120, 10);
  ctx.fillRect(750, 120, 130, 10);
  ctx.fillRect(410, 70, 160, 10);
  ctx.restore();
}

function drawNameTags() {
  drawTag(player, "YOU");
  drawTag(bot, "BOT " + currentRound);
}

function drawTag(fighter, text) {
  ctx.save();
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "center";

  const x = fighter.x + fighter.width / 2;
  const y = fighter.y - 14;

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x - 36, y - 18, 72, 22);

  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y - 2);

  ctx.restore();
}

function updateHUD() {
  const playerPercent = Math.max(0, player.hp / player.maxHp) * 100;
  const botPercent = Math.max(0, bot.hp / bot.maxHp) * 100;

  playerHealthEl.style.width = playerPercent + "%";
  botHealthEl.style.width = botPercent + "%";

  playerHpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
  botHpText.textContent = `${Math.ceil(bot.hp)} / ${bot.maxHp}`;

  roundText.textContent = `Round ${currentRound} / ${botOrder.length}`;

  if (player.specialCooldown <= 0) {
    specialText.textContent = "Special Ready";
    specialText.style.color = "#ffd36a";
  } else {
    const seconds = Math.ceil(player.specialCooldown / 60);
    specialText.textContent = `Special: ${seconds}s`;
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
    } else {
      currentRound++;
      setTimeout(() => {
        createBot(currentRound);
        player.hp = Math.min(player.maxHp, player.hp + 25);
      }, 500);
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

function buildBotOrder() {
  botOrder = fighterImages
    .map((_, index) => index)
    .filter(index => index !== selectedPlayerIndex);
}

function createFighterSelect() {
  const fighterSelect = document.getElementById("fighterSelect");

  if (!fighterSelect) return;

  fighterSelect.innerHTML = "";

  fighterImages.forEach((img, index) => {
    const button = document.createElement("button");

    button.className = "fighter-card";

    if (index === selectedPlayerIndex) {
      button.classList.add("active");
    }

    button.innerHTML = `
      <img src="${imagePaths[index]}" alt="Fighter ${index + 1}">
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

function restartGame() {
  gameState = "playing";
  currentRound = 1;
  attackEffects = [];
  screenShake = 0;

  overlay.classList.add("hidden");

  createPlayer();
  createBot(currentRound);
}

function gameLoop() {
  ctx.save();

  if (screenShake > 0) {
    const shakeX = (Math.random() - 0.5) * screenShake;
    const shakeY = (Math.random() - 0.5) * screenShake;
    ctx.translate(shakeX, shakeY);
    screenShake *= 0.86;

    if (screenShake < 0.6) {
      screenShake = 0;
    }
  }

  drawBackground();

  if (gameState === "playing") {
    handlePlayerInput();
    updateBotAI();

    player.update();
    bot.update();

    if (player.x < bot.x) {
      player.facing = player.vx !== 0 ? player.facing : 1;
      bot.facing = -1;
    } else {
      player.facing = player.vx !== 0 ? player.facing : -1;
      bot.facing = 1;
    }

    drawAttackEffects();

    if (player.y < bot.y) {
      player.draw();
      bot.draw();
    } else {
      bot.draw();
      player.draw();
    }

    drawNameTags();
    updateHUD();
    checkGameStatus();
  } else {
    drawAttackEffects();
    player.draw();
    bot.draw();
    drawNameTags();
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

restartBtn.addEventListener("click", restartGame);

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

loadImages().then(() => {
  buildBotOrder();
  createFighterSelect();
  restartGame();
  gameLoop();
});
