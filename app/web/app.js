// ============================
// Quizogram Web App (vanilla)
// ============================

// DOM refs
const loginView = document.getElementById("loginView");
const appView   = document.getElementById("appView");
const screen    = document.getElementById("screen");
const loginForm = document.getElementById("loginForm");
const logoutBtn = document.getElementById("logoutBtn");

// templates
const tplHome    = document.getElementById("tpl-home");
const tplSearch  = document.getElementById("tpl-search");
const tplCreate  = document.getElementById("tpl-create");
const tplProfile = document.getElementById("tpl-profile");

// tabs
const tabs = document.querySelectorAll(".tabbar .tab");

// state
let token = localStorage.getItem("quizogram_token") || "";
let activeTab = "home";
const API = location.origin;

// ---------- helpers ----------
function setScreen(node) {
  screen.innerHTML = "";
  screen.appendChild(node);
}

function clone(tpl) {
  return tpl.content.cloneNode(true);
}

function $(sel, root=document) { return root.querySelector(sel); }

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, m=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

function showLogin() {
  console.log("[UI] showLogin");
  loginView.hidden = false;
  appView.hidden   = true;
  // на случай агрессивных CSS-правил
  loginView.style.setProperty("display","block","important");
  appView.style.setProperty("display","none","important");
}

function showApp() {
  console.log("[UI] showApp");
  loginView.hidden = true;
  appView.hidden   = false;
  loginView.style.setProperty("display","none","important");
  appView.style.setProperty("display","block","important");
}

function setActiveTab(name) {
  activeTab = name;
  tabs.forEach(b => b.classList.toggle("active", b.getAttribute("data-tab") === name));
}

async function api(url, { method = "GET", data, form, headers } = {}) {
  const bearer = localStorage.getItem("quizogram_token") || localStorage.getItem("token");
  const initHeaders = {
    ...(headers || {}),
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
  };

  let body;

  // поддержка форм для OAuth2PasswordRequestForm
  if (form instanceof URLSearchParams) {
    initHeaders["Content-Type"] = "application/x-www-form-urlencoded";
    body = form;
  } else if (form instanceof FormData) {
    initHeaders["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams([...form.entries()]);
  } else if (data != null) {
    initHeaders["Content-Type"] = "application/json";
    body = JSON.stringify(data);
  }

  const res = await fetch(url, { method, headers: initHeaders, body });

  if (res.status === 401) {
    localStorage.removeItem("quizogram_token");
    try { showLogin(); } catch {}
    throw new Error('{"detail":"Not authenticated"}');
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(errText || `HTTP ${res.status}`);
  }

  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const txt = await res.text().catch(() => "");
    return txt || null;
  }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}




// ---------- boot (auto-login via ?username&password) ----------
(async function boot() {
  const params = new URLSearchParams(location.search);
  console.log("[Boot] token:", !!token, "query has creds:", params.has("username") && params.has("password"));

  if (!token && params.get("username") && params.get("password")) {
    try {
      console.log("[AutoLogin] trying…");
      const form = new URLSearchParams();
      form.set("username", params.get("username"));
      form.set("password", params.get("password"));
      const resp = await api("/api/v1/auth/login", { method: "POST", form });
      token = resp.access_token;
      localStorage.setItem("quizogram_token", token);
      history.replaceState({}, "", location.pathname); // убираем креды из URL
      console.log("[AutoLogin] success");
      showApp();
      setActiveTab("home");
      await renderHome();
      return;
    } catch (e) {
      console.error("[AutoLogin] failed:", e);
      alert("Автовход не удался. Войдите вручную.");
    }
  }

  if (token) {
    showApp();
    setActiveTab("home");
    await renderHome();
  } else {
    showLogin();
  }
})();

// ---------- auth handlers ----------
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(loginForm);
      const resp = await api("/api/v1/auth/login", { method:"POST", form: fd, auth:false });
      console.log("[Login] success, got token:", !!resp.access_token);
      token = resp.access_token;
      localStorage.setItem("quizogram_token", token);
      loginForm.reset();
      showApp();
      setActiveTab("home");
      await renderHome();
    } catch (err) {
      console.error("[Login] error:", err);
      alert("Не удалось войти. Проверьте имя/пароль.");
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    token = "";
    localStorage.removeItem("quizogram_token");
    showLogin();
  });
}

// ---------- tab navigation ----------
tabs.forEach(btn => {
  btn.addEventListener("click", async () => {
    if (!token) { showLogin(); return; }
    // гарантируем, что логин скрыт
    showApp();
    const tab = btn.getAttribute("data-tab");
    setActiveTab(tab);
    try {
      if (tab === "home")    await renderHome();
      if (tab === "search")  await renderSearch();
      if (tab === "create")  await renderCreate();
      if (tab === "random")  await renderRandom();
      if (tab === "profile") await renderProfile();
    } catch (e) {
      console.error(`[Tab ${tab}] render error:`, e);
    }
  });
});

// ---------- views ----------

// HOME (feed)
async function renderHome() {
  const node = clone(tplHome);
  const feedBox = $(".feed", node);
  feedBox.innerHTML = `<div class="muted">Загрузка ленты…</div>`;

  try {
    const items = await api("/api/v1/social/feed");

    if (!items.length) {
      feedBox.innerHTML = `<div class="muted">Пока пусто. Подпишись на кого-нибудь или создай квиз.</div>`;
    } else {
      feedBox.innerHTML = "";

      items.forEach(item => {
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
          <div class="row space-between">
            <b>@${escapeHtml(item.owner_username)}</b>
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          <p class="muted">${escapeHtml(item.description || "")}</p>

          <div class="row gap actions">
            <button class="like-btn" title="Лайк" data-act="like">
              ${item.is_liked_by_me ? "❤️" : "🤍"}
              <span class="like-count">${item.like_count}</span>
            </button>
            <button class="open-btn" title="Играть" data-act="open">🎮</button>
          </div>
        `;

        const likeBtn   = card.querySelector('[data-act="like"]');
        const openBtn   = card.querySelector('[data-act="open"]');
        const likeCount = card.querySelector(".like-count");

        likeBtn.onclick = async () => {
          const path = `/api/v1/social/like/${item.quiz_id}`;
          const wasLiked = item.is_liked_by_me;

          // оптимистичное обновление UI
          item.is_liked_by_me = !wasLiked;
          item.like_count += wasLiked ? -1 : 1;
          likeBtn.firstChild.nodeValue = item.is_liked_by_me ? "❤️" : "🤍";
          likeCount.textContent = item.like_count;

          // анимации
          likeBtn.classList.remove("heartbeat");
          likeCount.classList.remove("pop");
          void likeBtn.offsetWidth;  // перезапуск анимации
          void likeCount.offsetWidth;
          likeBtn.classList.add("heartbeat");
          likeCount.classList.add("pop");

          try {
            await api(path, { method: wasLiked ? "DELETE" : "POST" });
          } catch (e) {
            // откат при ошибке
            item.is_liked_by_me = wasLiked;
            item.like_count += wasLiked ? 1 : -1;
            likeBtn.firstChild.nodeValue = item.is_liked_by_me ? "❤️" : "🤍";
            likeCount.textContent = item.like_count;
            alert("Не удалось обновить лайк");
          }
        };

        openBtn.onclick = () => openQuiz(item.quiz_id);

        feedBox.appendChild(card);
      });
    }
  } catch (e) {
    feedBox.innerHTML = `<div class="error">Ошибка загрузки ленты</div>`;
    console.error(e);
  }

  setScreen(node);
}

// SEARCH (клиентский фильтр)
async function renderSearch() {
  const node = clone(tplSearch);
  const form = $(".searchbar", node);
  const list = $("#searchList", node); // это .quiz-grid (плитки квизов)
  list.innerHTML = `<div class="muted">Загрузка…</div>`;

  // Вставим блок под пользователей над сеткой
  const usersWrap = document.createElement("div");
  usersWrap.id = "userResults";
  usersWrap.innerHTML = `
    <h3 style="margin:.5rem 0">Пользователи</h3>
    <div class="user-list" id="userList"></div>
  `;
  // Вставим usersWrap ПЕРЕД list
  list.parentNode.insertBefore(usersWrap, list);

  let allQuizzes = [];
  try {
    allQuizzes = await api("/api/v1/quizzes/");
    list.innerHTML = "";
  } catch (e) {
    list.innerHTML = `<div class="error">Не удалось загрузить квизы</div>`;
    console.error(e);
  }

  async function renderUsers(filter) {
    const userList = usersWrap.querySelector("#userList");
    if (!filter || filter.trim().length < 2) {
      userList.innerHTML = `<div class="muted small">Введите минимум 2 символа для поиска пользователей</div>`;
      return;
    }
    try {
      const res = await api(`/api/v1/profile/search_users?q=${encodeURIComponent(filter)}`);
      const users = res.results || [];
      if (!users.length) {
        userList.innerHTML = `<div class="muted">Нет пользователей</div>`;
        return;
      }
      userList.innerHTML = "";
      users.forEach(u => {
        const item = document.createElement("button");
        item.className = "user-item";
        item.innerHTML = `
          <img src="${u.avatar_url}" width="36" height="36" style="image-rendering:pixelated;border-radius:50%;border:1px solid #2c3342"/>
          <span>@${escapeHtml(u.username)}</span>
        `;
        item.addEventListener("click", () => renderPublicProfile(u.username));
        userList.appendChild(item);
      });
    } catch (e) {
      console.error(e);
      userList.innerHTML = `<div class="error">Ошибка поиска пользователей</div>`;
    }
  }

  function renderQuizzes(filter="") {
    list.innerHTML = "";
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? allQuizzes.filter(x => (x.title||"").toLowerCase().includes(q) || (x.description||"").toLowerCase().includes(q))
      : allQuizzes;

    if (!filtered.length) {
      list.innerHTML = `<div class="muted">Квизы не найдены</div>`;
      return;
    }
    filtered.forEach(x => {
      const btn = document.createElement("button");
      btn.className = "quiz-tile";
      btn.title = x.title || "";
      btn.innerHTML = `<div class="quiz-tile-title">${escapeHtml(x.title)}</div>`;
      btn.addEventListener("click", () => openQuiz(x.id));
      list.appendChild(btn);
    });
  }

  form.addEventListener("input", () => {
    const val = String(new FormData(form).get("q") || "");
    renderUsers(val);
    renderQuizzes(val);
  });

  // стартовый рендер без фильтра (покажем только квизы)
  usersWrap.querySelector("#userList").innerHTML =
    `<div class="muted small">Введите минимум 2 символа для поиска пользователей</div>`;
  renderQuizzes();

  setScreen(node);
}



// CREATE (новый квиз) — динамические вопросы
async function renderCreate() {
  const node = clone(tplCreate);
  const form = $("#quizForm", node);
  const qContainer = $("#qContainer", node);
  const addBtn = $("#addQuestionBtn", node);

  // фабрика вопроса
  function createQuestionBox(idx) {
    const fs = document.createElement("fieldset");
    fs.className = "qbox";
    fs.dataset.idx = String(idx);

    fs.innerHTML = `
      <legend>Вопрос ${idx + 1}</legend>
      <input name="q${idx}_text" placeholder="Текст вопроса" required />

      <div class="vstack gap small">
        ${[0,1,2,3].map(oi => `
          <label class="option row gap">
            <input type="radio" name="q${idx}_correct" value="${oi}" ${oi===0 ? "checked" : ""} />
            <input name="q${idx}_opt${oi}" placeholder="Вариант ${oi+1}"/>
          </label>
        `).join("")}
      </div>

      <div class="row gap" style="justify-content:flex-end;margin-top:6px;">
        <button type="button" class="danger" data-act="remove">Удалить вопрос</button>
      </div>
    `;

    // удаление вопроса
    fs.querySelector('[data-act="remove"]').addEventListener("click", () => {
      fs.remove();
      renumber();
    });

    return fs;
  }

  // пере-нумерация после удаления
  function renumber() {
    const blocks = [...qContainer.querySelectorAll(".qbox")];
    blocks.forEach((fs, newIdx) => {
      const oldIdx = Number(fs.dataset.idx);
      fs.dataset.idx = String(newIdx);
      fs.querySelector("legend").textContent = `Вопрос ${newIdx + 1}`;

      // переименуем инпуты под новый индекс
      fs.querySelectorAll("input").forEach(inp => {
        if (inp.name.startsWith(`q${oldIdx}_`)) {
          inp.name = inp.name.replace(`q${oldIdx}_`, `q${newIdx}_`);
        }
      });
    });
  }

  // добавить вопрос
  function addQuestion() {
    const idx = qContainer.querySelectorAll(".qbox").length;
    const box = createQuestionBox(idx);
    qContainer.appendChild(box);
  }

  // старт — один вопрос
  addQuestion();

  addBtn.addEventListener("click", addQuestion);

  // сабмит формы
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const title = (fd.get("title") || "").toString().trim();
    const description = (fd.get("description") || "").toString();

    if (!title) {
      alert("Введите название квиза");
      return;
    }

    const blocks = [...qContainer.querySelectorAll(".qbox")];
    if (!blocks.length) {
      alert("Добавьте хотя бы один вопрос");
      return;
    }

    const questions = [];
    for (const fs of blocks) {
      const idx = Number(fs.dataset.idx);
      const text = (fd.get(`q${idx}_text`) || "").toString().trim();
      if (!text) {
        alert(`Вопрос ${idx + 1}: заполните текст`);
        return;
      }

      // соберём непустые варианты
      const rawOptions = [];
      for (let oi = 0; oi < 4; oi++) {
        const val = (fd.get(`q${idx}_opt${oi}`) || "").toString().trim();
        if (val) rawOptions.push({ text: val, origIndex: oi });
      }
      if (rawOptions.length < 2) {
        alert(`Вопрос ${idx + 1}: минимум 2 варианта`);
        return;
      }

      // выбранный радиобаттон (исходный индекс)
      const selectedRaw = Number(fd.get(`q${idx}_correct`) ?? 0);

      // найти позицию выбранного среди НЕпустых
      let correct = 0;
      for (let k = 0; k < rawOptions.length; k++) {
        if (rawOptions[k].origIndex === selectedRaw) { correct = k; break; }
      }

      questions.push({
        text,
        options: rawOptions.map(o => ({ text: o.text })),
        correct_option_index: correct,
      });
    }

    try {
      const payload = { title, description, questions };
      const created = await api("/api/v1/quizzes/", { method: "POST", data: payload });
      alert(`Квиз создан: id=${created.id}`);
      form.reset();
      qContainer.innerHTML = "";
      addQuestion(); // новый чистый вопрос
      setActiveTab("home");
      await renderHome();
    } catch (err) {
      console.error(err);
      alert("Не удалось создать квиз");
    }
  });

  setScreen(node);
}



// PROFILE
async function renderProfile() {
  const node = clone(document.getElementById("tpl-profile"));
  const meCard = $("#meCard", node);

  try {
    const me = await api("/api/v1/profile/me");
    meCard.innerHTML = `
      <div class="profile-header">
        <img src="${me.avatar_url}" width="96" height="96"
             style="image-rendering:pixelated;border-radius:50%;border:2px solid #2c3342"/>
        <div class="profile-info">
          <h2>
            @${escapeHtml(me.username)}
            <button class="icon-btn" id="editProfileBtn" title="Настройки профиля">✎</button>
          </h2>
          <div class="profile-stats">
            <span><b>${me.quiz_count}</b> квизов</span>
            <span><b>${me.followers}</b> подписчиков</span>
            <span><b>${me.following}</b> подписки</span>
          </div>
          <p class="muted">${escapeHtml(me.bio || "О себе пока ничего нет")}</p>
        </div>
      </div>

      <h3 style="margin-top:1rem;">Мои квизы</h3>
      <div class="quiz-grid" id="userQuizGrid">
        ${
          (me.quizzes && me.quizzes.length)
          ? me.quizzes.map(q => `
              <button class="quiz-tile" data-id="${q.id}" title="${escapeHtml(q.title)}">
                <div class="quiz-tile-title">${escapeHtml(q.title)}</div>
              </button>
            `).join("")
          : '<div class="muted">Пока нет квизов</div>'
        }
      </div>
    `;

    // открытие квиза
    const grid = $("#userQuizGrid", meCard);
    if (grid) {
      grid.querySelectorAll(".quiz-tile").forEach(btn => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-id");
          openQuiz(id);
        });
      });
    }

    // переход в настройки
    const editBtn = $("#editProfileBtn", meCard);
    if (editBtn) {
      editBtn.addEventListener("click", () => renderProfileSettings());
    }
  } catch (e) {
    meCard.innerHTML = `<div class="error">Не удалось загрузить профиль</div>`;
    console.error(e);
  }

  setScreen(node);
}

async function renderProfileSettings() {
  const node = clone(document.getElementById("tpl-profile-settings"));
  const backBtn     = $("#backToProfile", node);
  const settingsHdr = $("#settingsHeader", node);
  const avatarGrid  = $("#avatarGrid", node);
  const bioForm     = $("#bioForm", node);

  backBtn.addEventListener("click", () => renderProfile());

  // загрузим текущие данные
  let me;
  try {
    me = await api("/api/v1/profile/me");
    settingsHdr.innerHTML = `
      <img src="${me.avatar_url}" width="72" height="72"
           style="image-rendering:pixelated;border-radius:50%;border:1px solid #2c3342"/>
      <div>
        <div><b>@${escapeHtml(me.username)}</b></div>
        <div class="muted small">${escapeHtml(me.bio || "О себе не заполнено")}</div>
      </div>
    `;
    // предварительно подставим текущее био
    bioForm.bio.value = me.bio || "";
  } catch (e) {
    settingsHdr.innerHTML = `<div class="error">Не удалось загрузить профиль</div>`;
  }

  // список аватаров
  try {
    const options = await api("/api/v1/profile/avatars");
    avatarGrid.innerHTML = "";
    options.forEach(opt=>{
      const btn = document.createElement("button");
      btn.className = "avatar-btn";
      btn.innerHTML = `
        <img src="${opt.url}" alt="${opt.key}" width="72" height="72"
             style="image-rendering:pixelated;border-radius:8px;border:1px solid #2c3342">
        <small>${opt.key}</small>
      `;
      btn.addEventListener("click", ()=>{
        bioForm.avatar_key.value = opt.key;
        [...avatarGrid.children].forEach(c=>c.classList.remove("selected"));
        btn.classList.add("selected");
      });
      // выделим текущий
      if (me && opt.url === me.avatar_url) btn.classList.add("selected");
      avatarGrid.appendChild(btn);
    });
  } catch (e) {
    avatarGrid.innerHTML = `<div class="error">Не удалось загрузить аватары</div>`;
  }

  // сохранение
  bioForm.addEventListener("submit", async (e)=>{
    e.preventDefault();
    try {
      const payload = Object.fromEntries(new FormData(bioForm));
      if (!payload.bio) delete payload.bio;
      if (!payload.avatar_key) delete payload.avatar_key;
      await api("/api/v1/profile/me", { method:"PATCH", data: payload });
      alert("Настройки сохранены");
      renderProfile(); // вернёмся на профиль
    } catch (e) {
      alert("Не удалось сохранить");
    }
  });

  setScreen(node);
}

// --- ЗВУКИ ---
function playCorrect() {
  // Мягкий «дзынь» через WebAudio
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = 880; // A5
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + 0.4);
}

function playWrong() {
  // Короткий «бззз» (ошибка)
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "square";
  o.frequency.setValueAtTime(220, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.25);
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + 0.32);
}

// --- ОВЕРЛЕИ ---
function showOverlay(colorClass, duration = 600) {
  const ov = document.createElement("div");
  ov.className = `fx-overlay ${colorClass}`;
  document.body.appendChild(ov);
  setTimeout(() => ov.classList.add("show"), 10);
  setTimeout(() => {
    ov.classList.remove("show");
    setTimeout(() => ov.remove(), 250);
  }, duration);
}

// --- КОНФЕТТИ (лёгкий, без библиотек) ---
function confettiBurst(times = 240) {
  const c = document.createElement("canvas");
  c.className = "confetti-canvas";
  document.body.appendChild(c);
  const ctx = c.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const W = c.width  = window.innerWidth  * dpr;
  const H = c.height = window.innerHeight * dpr;
  c.style.width  = `${window.innerWidth}px`;
  c.style.height = `${window.innerHeight}px`;

  const pieces = [];
  for (let i = 0; i < times; i++) {
    pieces.push({
      x: Math.random() * W,
      y: -Math.random() * H * 0.4,
      w: 6 * dpr,
      h: 10 * dpr,
      vx: (Math.random() - 0.5) * 3 * dpr,
      vy: (2 + Math.random() * 3) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.2,
      col: `hsl(${Math.floor(Math.random()*360)},90%,60%)`
    });
  }

  let t = 0;
  const maxT = 120; // ~2 сек
  function frame() {
    ctx.clearRect(0,0,W,H);
    pieces.forEach(p=>{
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.col;
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
    });
    t++;
    if (t < maxT) requestAnimationFrame(frame);
    else c.remove();
  }
  frame();
}

function renderQuizResult(quiz, result) {
  const node = document.createElement("div");
  node.className = "result-wrap";
  node.innerHTML = `
    <div class="result-card">
      <div class="result-badge">${result.score}/${result.total}</div>
      <h2>${escapeHtml(quiz.title || "Результат")}</h2>
      <p class="muted">${result.score === result.total
        ? "Идеально! Так держать 💪"
        : result.score === 0
        ? "Не расстраивайся — попробуй ещё раз! 💫"
        : "Неплохо! Попробуешь улучшить результат? 🎯"}</p>
      <div class="row gap actions-center">
        <button class="primary" id="resRetry">Сыграть ещё раз</button>
        <button class="ghost"   id="resHome">В ленту</button>
        <button class="ghost"   id="resProfile">Профиль</button>
      </div>
    </div>
  `;
  // лёгкий эффект при идеале — конфетти и чутка звука
  if (Number(result.score) === Number(result.total)) {
    confettiBurst(200);
    playCorrect();
  }
  setScreen(node);

  node.querySelector("#resRetry").onclick   = () => openQuiz(quiz.id);
  node.querySelector("#resHome").onclick    = () => renderHome();
  node.querySelector("#resProfile").onclick = () => renderProfile();
}


async function openQuiz(quizId) {
  const tpl = document.getElementById("tpl-quiz");
  const node = tpl.content.cloneNode(true);
  const backBtn = node.querySelector("#quizBackBtn");
  const titleEl = node.querySelector("#quizTitle");
  const descEl  = node.querySelector("#quizDesc");
  const form    = node.querySelector("#quizForm");
  const submit  = node.querySelector("#quizSubmitBtn");

  backBtn.addEventListener("click", async () => {
    if (activeTab === "search") await renderSearch();
    else if (activeTab === "profile") await renderProfile();
    else await renderHome();
  });

  // грузим квиз
  let quiz;
  try {
    quiz = await api(`/api/v1/quizzes/${quizId}`);
  } catch (e) {
    alert("Не удалось загрузить квиз");
    return;
  }

  titleEl.textContent = quiz.title || "Квиз";
  descEl.textContent  = quiz.description || "";

  // состояние шага
  let idx = 0;                             // текущий вопрос
  const answers = [];                      // накапливаем ответы {question_id, selected_option_index}

  // прогресс (точки)
  const progress = document.createElement("div");
  progress.className = "quiz-progress";
  form.parentNode.insertBefore(progress, form);

  function renderProgress() {
    progress.innerHTML = "";
    for (let i = 0; i < quiz.questions.length; i++) {
      const dot = document.createElement("span");
      dot.className = "dot" + (i === idx ? " active" : "") + (i < idx ? " passed" : "");
      progress.appendChild(dot);
    }
  }

  function renderStep() {
    renderProgress();
    form.querySelectorAll(".q-block").forEach(n => n.remove());
    submit.textContent = (idx < quiz.questions.length - 1) ? "Ответить" : "Завершить";

    const q = quiz.questions[idx];

    const fs = document.createElement("fieldset");
    fs.className = "q-block";
    const legend = document.createElement("legend");
    legend.textContent = `${idx + 1}/${quiz.questions.length}. ${q.text}`;
    fs.appendChild(legend);

    q.options.forEach((opt, i) => {
      const row = document.createElement("label");
      row.className = "option";
      row.innerHTML = `
        <input type="radio" name="q_${q.id}" value="${i}" ${i === 0 ? "checked" : ""} />
        <span>${escapeHtml(opt.text)}</span>
      `;
      fs.appendChild(row);
    });

    form.insertBefore(fs, submit);
  }

  // первая отрисовка
  renderStep();

  // обработчик ответа на КАЖДОМ вопросе
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submit.disabled = true;

    const q = quiz.questions[idx];
    const picked = form.querySelector(`input[name="q_${q.id}"]:checked`);
    const selectedIdx = Number(picked?.value ?? 0);

    // запросим проверку ОДНОГО вопроса
    try {
      const r = await api(`/api/v1/attempts/${quiz.id}/check`, {
        method: "POST",
        data: { question_id: q.id, selected_option_index: selectedIdx }
      });

      const block = form.querySelector(".q-block");
      if (r.correct) {
        block.classList.remove("wrong");
        block.classList.add("correct");
        confettiBurst(120);
        playCorrect();
        showOverlay("ok", 400);
      } else {
        block.classList.remove("correct");
        block.classList.add("wrong");
        playWrong();
        showOverlay("bad", 500);
      }

      // сохраним ответ
      answers[idx] = { question_id: q.id, selected_option_index: selectedIdx };

      // следующая «ступень» через маленькую паузу
      setTimeout(async () => {
        if (idx < quiz.questions.length - 1) {
          idx += 1;
          renderStep();
          submit.disabled = false;
        } else {
          // финал: отправим все ответы как раньше
          try {
            const res = await api(`/api/v1/attempts/${quiz.id}`, {
              method: "POST",
              data: { answers }
            });

            // финальный эффект (по желанию)
            renderQuizResult(quiz, res);
          } catch (err) {
            console.error(err);
            alert("Не удалось завершить попытку");
            // Вернём в начало квиза
            idx = 0; renderStep();
          }
        }
      }, 450);
    } catch (e2) {
      console.error(e2);
      alert("Ошибка проверки ответа");
      submit.disabled = false;
    }
  });

  setScreen(node);
}


async function renderRandom() {
  // простой клиентский рандом: запрашиваем все, выбираем случайный
  let all = [];
  try {
    all = await api("/api/v1/quizzes/");
  } catch (e) {
    setScreen(document.createTextNode("Не удалось загрузить список квизов"));
    return;
  }

  if (!all.length) {
    const wrap = document.createElement("div");
    wrap.className = "vstack gap";
    wrap.innerHTML = `<h2>Случайный квиз</h2><div class="muted">Пока нет квизов</div>`;
    setScreen(wrap);
    return;
  }

  const pick = () => all[Math.floor(Math.random() * all.length)];

  const node = document.createElement("div");
  node.className = "vstack gap";
  node.innerHTML = `
    <div class="row space-between">
      <h2>Случайный квиз</h2>
      <div class="row gap">
        <button id="randomRefresh" class="icon-btn" title="Другой">↻</button>
      </div>
    </div>
    <div id="randomCard" class="card"></div>
    <div class="row gap">
      <button class="primary" id="randomStart">Начать</button>
    </div>
  `;

  let current = pick();

  const randomCard = node.querySelector("#randomCard");
  const renderCard = () => {
    randomCard.innerHTML = `
      <h3>${escapeHtml(current.title)}</h3>
      <p class="muted">${escapeHtml(current.description || "")}</p>
    `;
  };

  renderCard();

  node.querySelector("#randomRefresh").addEventListener("click", () => {
    current = pick();
    renderCard();
  });

  node.querySelector("#randomStart").addEventListener("click", () => {
    openQuiz(current.id);
  });

  setScreen(node);
}

async function renderPublicProfile(username) {
  const node = clone(tplProfile);
  const meCard = $("#meCard", node);

  try {
    const p = await api(`/api/v1/profile/user/${encodeURIComponent(username)}`);

    const needsBtn = !p.is_me;
    const initialLabel = p.is_following ? "Отписаться" : "Подписаться";
    const initialClass = p.is_following ? "follow-btn danger" : "follow-btn";

    meCard.innerHTML = `
      <div class="profile-header">
        <img src="${p.avatar_url}" width="96" height="96"
             style="image-rendering:pixelated;border-radius:50%;border:2px solid #2c3342"/>
        <div class="profile-info">
          <h2>
            @${escapeHtml(p.username)}
            ${needsBtn ? `<button class="${initialClass}" id="followBtn">${initialLabel}</button>` : ""}
          </h2>
          <div class="profile-stats" id="publicStats">
            <span><b>${p.quiz_count}</b> квизов</span>
            <span><b>${p.followers}</b> подписчиков</span>
            <span><b>${p.following}</b> подписки</span>
          </div>
          <p class="muted">${escapeHtml(p.bio || "О себе пока ничего нет")}</p>
        </div>
      </div>

      <h3 style="margin-top:1rem;">Квизы пользователя</h3>
      <div class="quiz-grid" id="userQuizGrid">
        ${
          (p.quizzes && p.quizzes.length)
          ? p.quizzes.map(q => `
              <button class="quiz-tile" data-id="${q.id}" title="${escapeHtml(q.title)}">
                <div class="quiz-tile-title">${escapeHtml(q.title)}</div>
              </button>
            `).join("")
          : '<div class="muted">Пока нет квизов</div>'
        }
      </div>
    `;

    // плитки квизов
    const grid = $("#userQuizGrid", meCard);
    if (grid) {
      grid.querySelectorAll(".quiz-tile").forEach(btn => {
        btn.addEventListener("click", () => openQuiz(btn.getAttribute("data-id")));
      });
    }

    // кнопка подписки
    if (needsBtn) {
      const btn = meCard.querySelector("#followBtn");
      const statsEl = meCard.querySelector("#publicStats");

      const updateBtn = () => {
        btn.textContent = p.is_following ? "Отписаться" : "Подписаться";
        btn.className = p.is_following ? "follow-btn danger" : "follow-btn";
      };

      btn.addEventListener("click", async () => {
        try {
          btn.disabled = true;
          if (p.is_following) {
            await api(`/api/v1/follow/${encodeURIComponent(p.username)}`, { method: "DELETE" });
            p.is_following = false;
            p.followers = Math.max(0, (p.followers || 1) - 1);
          } else {
            await api(`/api/v1/follow/${encodeURIComponent(p.username)}`, { method: "POST" });
            p.is_following = true;
            p.followers = (p.followers || 0) + 1;
          }
          statsEl.innerHTML = `
            <span><b>${p.quiz_count}</b> квизов</span>
            <span><b>${p.followers}</b> подписчиков</span>
            <span><b>${p.following}</b> подписки</span>
          `;
          updateBtn();
        } catch (err) {
          alert("Не удалось изменить подписку");
        } finally {
          btn.disabled = false;
        }
      });

      updateBtn();
    }
  } catch (e) {
    console.error("[PublicProfile] load error:", e);
    meCard.innerHTML = `<div class="error">Профиль не найден</div>`;
  }

  setScreen(node);
}



