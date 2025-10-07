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

async function api(path, {method="GET", data, form, auth=true} = {}) {
  const url = `${API}${path}`;
  const headers = {};
  let body;

  if (form) {
    body = new URLSearchParams(form);
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  } else if (data) {
    body = JSON.stringify(data);
    headers["Content-Type"] = "application/json";
  }
  if (auth && token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { method, headers, body });
  if (!res.ok) {
    let msg = await res.text().catch(()=>res.statusText);
    if (res.status === 401) {
      console.warn("[API] 401 → drop token & show login");
      localStorage.removeItem("quizogram_token");
      token = "";
      alert("Сессия истекла. Войдите заново.");
      showLogin();
      return Promise.reject(new Error("401 Unauthorized"));
    }
    throw new Error(`${res.status} ${res.statusText}: ${msg}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
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
      const resp = await api("/api/v1/auth/login", { method:"POST", form, auth:false });
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
            <span class="muted">❤ ${item.like_count}</span>
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          <p class="muted">${escapeHtml(item.description || "")}</p>
          <div class="row gap">
            <button data-act="like">${item.is_liked_by_me ? "Убрать лайк" : "Лайк"}</button>
            <button data-act="open">Открыть</button>
          </div>
        `;
        card.querySelector('[data-act="like"]').onclick = async ()=>{
          try {
            const path = `/api/v1/social/like/${item.quiz_id}`;
            await api(path, { method: item.is_liked_by_me ? "DELETE" : "POST" });
            await renderHome(); // обновим ленту
          } catch (e) { alert("Не удалось обновить лайк"); }
        };
        card.querySelector('[data-act="open"]').onclick = ()=>{
          openQuiz(item.quiz_id);
        };

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
  const list = $("#searchList", node);
  list.innerHTML = `<div class="muted">Загрузка…</div>`;

  let all = [];
  try {
    all = await api("/api/v1/quizzes/");
    list.innerHTML = "";
  } catch (e) {
    list.innerHTML = `<div class="error">Не удалось загрузить список</div>`;
    console.error(e);
  }

  function render(filter="") {
    list.innerHTML = "";
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? all.filter(x => (x.title||"").toLowerCase().includes(q) || (x.description||"").toLowerCase().includes(q))
      : all;

    if (!filtered.length) {
      list.innerHTML = `<div class="muted">Ничего не найдено</div>`;
      return;
    }

    filtered.forEach(x => {
      const btn = document.createElement("button");
      btn.className = "quiz-tile";
      btn.title = x.title || "";
      btn.innerHTML = `
        <div class="quiz-tile-title">${escapeHtml(x.title)}</div>
      `;
      btn.addEventListener("click", () => openQuiz(x.id));
      list.appendChild(btn);
    });
  }

  form.addEventListener("input", () => {
    const val = new FormData(form).get("q") || "";
    render(String(val));
  });

  render();
  setScreen(node);
}


// CREATE (новый квиз)
async function renderCreate() {
  const node = clone(tplCreate);
  const form = $("#quizForm", node);

  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const fd = new FormData(form);
    const title = fd.get("title");
    const description = fd.get("description");

    const qs = [];
    for (let i=0;i<2;i++) {
      const text = fd.get(`q${i}_text`);
      if (!text) continue;
      const options = [];
      for (let j=0;j<4;j++) {
        const t = fd.get(`q${i}_opt${j}`);
        if (t) options.push({ text: String(t) });
      }
      const correct = parseInt(fd.get(`q${i}_correct`),10) || 0;
      qs.push({ text: String(text), options, correct_option_index: correct });
    }

    if (!qs.length || qs[0].options.length < 2) {
      alert("Нужен минимум 1 вопрос и 2 варианта");
      return;
    }

    try {
      const payload = { title: String(title), description: String(description || ""), questions: qs };
      const created = await api("/api/v1/quizzes/", { method:"POST", data: payload });
      alert(`Квиз создан: id=${created.id}`);
      form.reset();
      setActiveTab("home");
      await renderHome();
    } catch (e) {
      console.error(e);
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

async function openQuiz(quizId) {
  const tpl = document.getElementById("tpl-quiz");
  const node = tpl.content.cloneNode(true);
  const backBtn = node.querySelector("#quizBackBtn");
  const titleEl = node.querySelector("#quizTitle");
  const descEl  = node.querySelector("#quizDesc");
  const form    = node.querySelector("#quizForm");
  const submit  = node.querySelector("#quizSubmitBtn");

  backBtn.addEventListener("click", async () => {
    // вернёмся туда, где были (дом/поиск/профиль)
    if (activeTab === "search") await renderSearch();
    else if (activeTab === "profile") await renderProfile();
    else await renderHome();
  });

  // загрузим квиз
  let quiz;
  try {
    quiz = await api(`/api/v1/quizzes/${quizId}`);
  } catch (e) {
    alert("Не удалось загрузить квиз");
    return;
  }

  titleEl.textContent = quiz.title || "Квиз";
  descEl.textContent  = quiz.description || "";

  // отрисуем вопросы
  // ожидаем структуру: quiz.questions: [{id, text, options:[{text},...]}, ...]
  form.querySelectorAll(".q-block").forEach(n => n.remove());
  quiz.questions.forEach((q, i) => {
    const fs = document.createElement("fieldset");
    fs.className = "q-block";
    const legend = document.createElement("legend");
    legend.textContent = `${i+1}. ${q.text}`;
    fs.appendChild(legend);

    q.options.forEach((opt, idx) => {
      const label = document.createElement("label");
      label.className = "option";
      label.innerHTML = `
        <input type="radio" name="q_${q.id}" value="${idx}" ${idx === 0 ? "checked" : ""} />
        <span>${escapeHtml(opt.text)}</span>
      `;
      fs.appendChild(label);
    });

    form.insertBefore(fs, submit);
  });

  // отправка ответов
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submit.disabled = true;
    try {
      const answers = quiz.questions.map(q => {
        const v = form.querySelector(`input[name="q_${q.id}"]:checked`);
        return { question_id: q.id, selected_option_index: Number(v?.value ?? 0) };
      });

      const res = await api(`/api/v1/attempts/${quiz.id}`, {
        method: "POST",
        data: { answers }
      });

      alert(`Результат: ${res.score}/${res.total}`);
      // после отправки вернёмся в профиль или ленту
      if (activeTab === "profile") await renderProfile();
      else await renderHome();
    } catch (err) {
      console.error(err);
      alert("Не удалось отправить ответы");
    } finally {
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
