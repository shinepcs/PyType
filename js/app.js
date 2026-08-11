import { SUPABASE_CONFIG } from "./config.js";
import { loadBeginnerGuideQuestions } from "./content/beginner-guide.js";
import { loadQuestionRepository } from "./content/question-repository.js";
import { GameState } from "./core/game-state.js";
import { createEmptySkillMastery, getWeakSkills, updateSkillMastery } from "./core/mastery.js";
import { QuestionSelector } from "./core/question-selector.js";
import { createLevel2PrerequisiteQuestion, level2PrerequisiteKey, recordLevel2Prerequisite } from "./core/level2-progression.js";
import {
  createDailySeed,
  GAME_MODES,
  insertDailyReviewQuestions,
  selectDailyReviewQuestions,
  SessionQueue,
} from "./core/session.js";
import { createRankingService } from "./services/ranking.js";
import { createCommunityContentService } from "./services/community-content.js";
import { createPresenceService } from "./services/presence.js";
import { createStorageRepository } from "./services/storage.js";
import { createSupabaseClient } from "./services/supabase-client.js";
import { announce, applyAccessibilitySettings } from "./ui/accessibility.js";
import {
  renderHud,
  renderQuestion,
  renderTypingFeedback,
  syncTypingPracticeScroll,
  triggerAttack,
} from "./ui/render-game.js";
import { renderProgress } from "./ui/render-progress.js";
import { renderRankingState, selectRankingTab } from "./ui/render-ranking.js";
import { renderRankingSubmission, renderResult } from "./ui/render-results.js";
import { renderPracticeRivals } from "./ui/render-practice-rivals.js";
import { renderOnlinePlayers } from "./ui/render-online-players.js";
import {
  findOvertakenCompetitors,
  mergeCompetitionPlayers,
  renderBattleCompetition,
  resetOvertakeEffect,
  triggerOvertakeEffect,
} from "./ui/render-competition.js";
import { fillQuestionForm, renderQuestionSourceOptions, updateQuestionFormLevel } from "./ui/render-question-editor.js";
import { createScreenRouter } from "./ui/router.js";
import { createSeededRandom } from "./utils/random.js";
import { createSessionId, validateNickname } from "./utils/validation.js";

const CLIENT_VERSION = "1.1.0";
const NEXT_QUESTION_DELAY_MS = 380;
const PRACTICE_QUESTION_LIMIT = 30;
const PRESENCE_REFRESH_MS = 30_000;

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $all(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

function formatClock(milliseconds) {
  const seconds = Math.max(0, Math.ceil(Number(milliseconds ?? 0) / 1_000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatElapsed(milliseconds) {
  const seconds = Math.max(0, Math.floor(Number(milliseconds ?? 0) / 1_000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function isBetterResult(candidate, previous) {
  if (!previous) return true;
  const comparisons = [
    [candidate.score, previous.score],
    [candidate.accuracy, previous.accuracy],
    [candidate.problemsSolved, previous.problemsSolved],
    [candidate.bestCombo, previous.bestCombo],
    [candidate.wpm, previous.wpm],
  ];
  for (const [left, right] of comparisons) {
    const difference = Number(left ?? 0) - Number(right ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

function collectQuestionStats(history, skillRecords = {}) {
  const stats = {};
  for (const session of history ?? []) {
    for (const result of session.problemResults ?? []) {
      if (!result?.questionId) continue;
      stats[result.questionId] = {
        errorCount: Number(result.errorCount ?? 0),
        slow: Boolean(result.slow),
        lastSeenAt: result.completedAt ?? session.completedAt,
      };
    }
  }
  for (const record of Object.values(skillRecords)) {
    for (const result of record.recentResults ?? []) {
      if (!result?.questionId) continue;
      stats[result.questionId] = {
        errorCount: Number(result.errorCount ?? 0),
        slow: Boolean(result.slow),
        lastSeenAt: result.completedAt,
        dueAt: record.dueAt,
      };
    }
  }
  return stats;
}

function isRankingPayloadEligible(result) {
  return result.gameMode === GAME_MODES.QUICK
    && result.rankEligible === true
    && result.endedNormally === true
    && Number.isInteger(result.problemsSolved)
    && result.problemsSolved >= 1
    && result.problemsSolved <= 40
    && Number.isInteger(result.survivalMs)
    && result.survivalMs >= 10_000
    && result.survivalMs <= 300_000
    && Number(result.accuracy) >= 0
    && Number(result.accuracy) <= 100
    && Number(result.wpm) >= 0
    && Number(result.wpm) <= 250;
}

function localResultToRankingRow(result, label = "LOCAL") {
  if (!result) return null;
  return {
    rank: label,
    playerName: result.playerName ?? result.nickname ?? "LOCAL PLAYER",
    score: Number(result.score ?? 0),
    accuracy: Number(result.accuracy ?? 0),
    wpm: Number(result.wpm ?? 0),
    problemsSolved: Number(result.problemsSolved ?? 0),
    bestCombo: Number(result.bestCombo ?? 0),
    survivalMs: Number(result.survivalMs ?? 0),
    createdAt: result.completedAt ?? new Date(0).toISOString(),
    isCurrentUser: true,
  };
}

function selectFeedbackAnswer(input, acceptedAnswers, fallback) {
  if (!Array.isArray(acceptedAnswers) || acceptedAnswers.length === 0) return fallback;
  const viable = acceptedAnswers.find((candidate) => candidate.startsWith(input));
  if (viable) return viable;
  return acceptedAnswers.reduce((best, candidate) => {
    let prefix = 0;
    while (prefix < input.length && prefix < candidate.length && input[prefix] === candidate[prefix]) prefix += 1;
    return prefix > best.prefix ? { candidate, prefix } : best;
  }, { candidate: fallback, prefix: -1 }).candidate;
}

class PythonTypingSurvivalApp {
  constructor() {
    this.router = createScreenRouter({
      onBeforeChange: (from) => {
        if (from === "game" && !this.activeSession) this.cancelFrame();
      },
    });
    this.storage = createStorageRepository({
      onStatus: (status) => this.handleStorageStatus(status),
    });
    this.supabase = createSupabaseClient(SUPABASE_CONFIG);
    this.ranking = createRankingService({
      client: this.supabase,
      storageRepository: this.storage,
    });
    this.communityContent = createCommunityContentService({ client: this.supabase });
    this.presence = createPresenceService({ client: this.supabase });

    this.repository = null;
    this.beginnerGuideQuestions = [];
    this.storageData = null;
    this.activeSession = null;
    this.frameId = null;
    this.lastFrameTime = 0;
    this.lastSessionRecord = null;
    this.lastSessionSetup = null;
    this.finishDestination = "result";
    this.rankingRequestToken = 0;
    this.currentRankingTab = "global";
    this.isComposing = false;
    this.pendingStart = null;
    this.hasBoundEvents = false;
    this.sharedQuestions = [];
    this.sharedContentRequest = null;
    this.presenceTimer = null;
    this.latestOnlinePlayers = [];
  }

  async initialize() {
    document.body.setAttribute("aria-busy", "true");
    this.bindEvents();
    this.storageData = this.storage.load();
    this.applyProfileToUi();
    const contentReady = await this.loadContent();
    if (contentReady) this.router.show("home", { focus: false });
    document.body.setAttribute("aria-busy", "false");

    if (contentReady && !this.storageData.profile.nickname) {
      window.setTimeout(() => $("#nickname-dialog").showModal(), 0);
    }
    this.connectRankingInBackground();
    this.refreshSharedQuestions();
    this.startPresenceLoop();
  }

  async loadContent() {
    try {
      [this.repository, this.beginnerGuideQuestions] = await Promise.all([
        loadQuestionRepository({
          baseUrl: "./data/",
          strict: false,
          onIssues: (issues) => console.warn(`콘텐츠 검증에서 ${issues.length}개 문제를 제외했습니다.`),
        }),
        loadBeginnerGuideQuestions({ baseUrl: "./data/" }),
      ]);
      this.renderPracticeSkills();
      return true;
    } catch {
      this.repository = null;
      this.beginnerGuideQuestions = [];
      this.showRecoverableError("문제 데이터 또는 템플릿을 불러오지 못했습니다. 연결을 확인하고 다시 시도하세요.");
      return false;
    }
  }

  bindEvents() {
    if (this.hasBoundEvents) return;
    this.hasBoundEvents = true;

    $("#nickname-form").addEventListener("submit", (event) => this.saveInitialNickname(event));
    $("#brand-home").addEventListener("click", () => this.goHome());
    $all("[data-nav-home]").forEach((button) => button.addEventListener("click", () => this.goHome()));
    $("#start-quick").addEventListener("click", () => this.requestSessionStart(GAME_MODES.QUICK));
    $("#start-daily").addEventListener("click", () => this.requestSessionStart(GAME_MODES.DAILY));
    $("#start-samples").addEventListener("click", () => this.requestSessionStart(
      GAME_MODES.PRACTICE,
      { sampleLogic: true },
    ));
    $("#start-beginner").addEventListener("click", () => this.requestSessionStart(
      GAME_MODES.PRACTICE,
      { beginnerGuide: true },
    ));
    $("#open-practice").addEventListener("click", () => this.openPractice());
    $("#start-practice").addEventListener("click", () => this.startPractice());
    $("#open-ranking").addEventListener("click", () => this.openRanking());
    $("#result-ranking").addEventListener("click", () => this.openRanking());
    $("#open-progress").addEventListener("click", () => this.openProgress());
    $("#open-settings").addEventListener("click", () => this.openSettings());
    $("#open-questions").addEventListener("click", () => this.openQuestionEditor());
    $("#question-source").addEventListener("change", () => this.selectQuestionSource());
    $("#question-level-input").addEventListener("change", () => updateQuestionFormLevel());
    $("#new-question").addEventListener("click", () => this.resetQuestionForm());
    $("#question-editor-form").addEventListener("submit", (event) => this.saveSharedQuestion(event));
    $("#play-again").addEventListener("click", () => this.playAgain());
    $("#pause-button").addEventListener("click", () => this.pauseManually());
    $("#practice-layout-horizontal").addEventListener("click", () => this.setPracticeLayout("horizontal"));
    $("#practice-layout-vertical").addEventListener("click", () => this.setPracticeLayout("vertical"));
    $("#skip-button").addEventListener("click", () => this.skipPracticeQuestion());
    $("#resume-button").addEventListener("click", () => this.resumeSession());
    $("#quit-session").addEventListener("click", () => this.quitSession());
    $("#retry-ranking").addEventListener("click", () => this.submitLastRanking());
    $("#retry-ranking-list").addEventListener("click", () => this.loadRanking(this.currentRankingTab));
    $("#settings-form").addEventListener("submit", (event) => this.saveSettings(event));
    $("#reset-data").addEventListener("click", () => $("#reset-dialog").showModal());
    $("#cancel-reset").addEventListener("click", () => $("#reset-dialog").close());
    $("#confirm-reset").addEventListener("click", () => this.resetLocalData());
    $("#settings-font-scale").addEventListener("input", (event) => {
      $("#font-scale-label").textContent = `${Math.round(Number(event.target.value) * 100)}%`;
    });
    $("#retry-app").addEventListener("click", async () => {
      if (await this.loadContent()) {
        this.router.show("home");
        if (!this.storage.read().profile.nickname && !$("#nickname-dialog").open) {
          $("#nickname-dialog").showModal();
        }
      }
    });

    for (const tab of $all("[data-ranking-tab]")) {
      tab.addEventListener("click", () => this.loadRanking(tab.dataset.rankingTab));
      tab.addEventListener("keydown", (event) => this.handleRankingTabKey(event));
    }

    const input = $("#typing-input");
    input.addEventListener("keydown", (event) => this.handleTypingKey(event));
    input.addEventListener("beforeinput", (event) => this.handleBeforeInput(event));
    input.addEventListener("input", () => this.restoreAuthoritativeInput());
    input.addEventListener("compositionstart", () => {
      this.isComposing = true;
      this.activeSession?.game.compositionStart();
    });
    input.addEventListener("compositionend", (event) => this.handleCompositionEnd(event));
    for (const eventName of ["paste", "drop", "cut"]) {
      input.addEventListener(eventName, (event) => this.blockInjectedInput(event));
    }

    document.addEventListener("visibilitychange", () => this.handleVisibilityChange());
    window.addEventListener("offline", () => this.updateNetworkStatus("offline"));
    window.addEventListener("online", () => this.connectRankingInBackground());
  }

  applyProfileToUi() {
    const data = this.storageData ?? this.storage.read();
    const nickname = data.profile.nickname ?? "—";
    $("#header-player").textContent = nickname;
    $("#settings-nickname").value = data.profile.nickname ?? "";
    $("#settings-motion").checked = Boolean(data.settings.reducedMotion);
    $("#settings-font-scale").value = String(data.settings.fontScale);
    $("#font-scale-label").textContent = `${Math.round(data.settings.fontScale * 100)}%`;
    applyAccessibilitySettings(data.settings);
    this.applyPracticeLayout(data.settings.practiceLayout);
  }

  applyPracticeLayout(layout) {
    const selected = layout === "vertical" ? "vertical" : "horizontal";
    $("#screen-game").dataset.practiceLayout = selected;
    $("#practice-layout-horizontal").setAttribute("aria-pressed", String(selected === "horizontal"));
    $("#practice-layout-vertical").setAttribute("aria-pressed", String(selected === "vertical"));
    requestAnimationFrame(() => syncTypingPracticeScroll());
  }

  setPracticeLayout(layout) {
    const selected = layout === "vertical" ? "vertical" : "horizontal";
    const result = this.storage.setSettings({ practiceLayout: selected });
    if (!result.ok) return;
    this.storageData = this.storage.read();
    this.applyPracticeLayout(selected);
    announce(`타이핑 연습 레이아웃을 ${selected === "vertical" ? "세로" : "가로"}로 변경했습니다.`);
  }

  handleStorageStatus(status) {
    if (status.status === "memory" || status.status === "recovered") {
      const label = status.status === "recovered"
        ? "손상된 로컬 데이터를 안전한 기본값으로 복구했습니다."
        : "로컬 저장을 사용할 수 없어 이번 탭의 메모리에서만 진행합니다.";
      announce(label, { clearAfterMs: 4_000 });
    }
  }

  saveInitialNickname(event) {
    event.preventDefault();
    const validation = validateNickname($("#nickname-input").value);
    $("#nickname-error").textContent = validation.message;
    if (!validation.valid) return;
    const saved = this.storage.setNickname(validation.value);
    if (!saved.ok) {
      $("#nickname-error").textContent = "닉네임을 저장하지 못했습니다. 다시 입력하세요.";
      return;
    }
    this.storageData = this.storage.read();
    this.applyProfileToUi();
    $("#nickname-dialog").close();
    announce(`${validation.value} 플레이어로 시작합니다.`);
    if (this.pendingStart) {
      const pending = this.pendingStart;
      this.pendingStart = null;
      this.startSession(pending.mode, pending.options);
    }
    this.refreshPresence();
  }

  renderPracticeSkills() {
    const container = $("#practice-skills");
    container.replaceChildren();
    for (const skill of this.repository.getSkills()) {
      const label = document.createElement("label");
      label.className = "skill-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = skill.id;
      checkbox.name = "practiceSkill";
      checkbox.addEventListener("change", () => this.updatePracticeStartState());
      const body = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = skill.label;
      const description = document.createElement("small");
      description.textContent = skill.description;
      body.append(name, description);
      label.append(checkbox, body);
      container.append(label);
    }
    this.updatePracticeStartState();
  }

  updatePracticeStartState() {
    $("#start-practice").disabled = $all("#practice-skills input:checked").length === 0;
  }

  async openPractice() {
    if (!this.repository) return this.showRecoverableError("콘텐츠를 먼저 불러와야 합니다.");
    await this.refreshSharedQuestions();
    this.router.show("practice");
  }

  startPractice() {
    const skills = $all("#practice-skills input:checked").map((input) => input.value);
    if (skills.length === 0) return;
    this.requestSessionStart(GAME_MODES.PRACTICE, { skills });
  }

  requestSessionStart(mode, options = {}) {
    if (!this.repository) return this.showRecoverableError("콘텐츠를 먼저 불러와야 합니다.");
    if (!this.storage.read().profile.nickname) {
      this.pendingStart = { mode, options };
      $("#nickname-dialog").showModal();
      return;
    }
    this.startSession(mode, options);
  }

  startSession(mode, options = {}) {
    this.cancelFrame();
    const contentVersion = this.getCompetitiveContentVersion();
    const seed = mode === GAME_MODES.DAILY
      ? createDailySeed(new Date(), contentVersion)
      : createSessionId();
    const skills = Array.isArray(options.skills) && options.skills.length > 0 ? options.skills : undefined;
    const officialPool = this.repository.getAll({ seed, skills });
    let pool = mode === GAME_MODES.PRACTICE
      ? this.mergeSharedPracticeQuestions(officialPool, skills)
      : officialPool;
    if (options.sampleLogic) pool = pool.filter((question) => question.tags.includes("sample-logic"));
    if (options.beginnerGuide) pool = [...this.beginnerGuideQuestions];
    this.storageData = this.storage.read();
    const questionStats = collectQuestionStats(
      this.storageData.history,
      this.storageData.progress.skills,
    );
    let plannedQuestions = null;
    if (mode === GAME_MODES.DAILY) {
      const baseRandom = createSeededRandom(`${seed}:base`);
      const baseSelector = new QuestionSelector(pool, { random: baseRandom });
      const baseQueue = new SessionQueue({
        selector: baseSelector,
        random: baseRandom,
        mode: GAME_MODES.DAILY,
        maxQuestions: 30,
      });
      const baseQuestions = [];
      while (!baseQueue.exhausted) {
        const question = baseQueue.next();
        if (!question) break;
        baseQuestions.push(question);
      }
      const reviewIds = selectDailyReviewQuestions(questionStats, 10);
      const reviewQuestions = reviewIds
        .map((sourceId) => pool.find((question) => question.sourceId === sourceId))
        .filter(Boolean);
      plannedQuestions = insertDailyReviewQuestions(baseQuestions, reviewQuestions, 10);
    } else if (options.beginnerGuide) {
      plannedQuestions = createSeededRandom(`${seed}:beginner-guide`).shuffle(pool);
    }
    const random = createSeededRandom(`${seed}:session`);
    const selector = new QuestionSelector(pool, { random });

    const maxQuestions = options.beginnerGuide
      ? this.beginnerGuideQuestions.length
      : mode === GAME_MODES.DAILY
      ? 30
      : mode === GAME_MODES.PRACTICE
        ? PRACTICE_QUESTION_LIMIT
        : 40;
    const queue = new SessionQueue({
      selector,
      random,
      mode,
      maxQuestions,
      skills,
      questionStats,
      skillRecords: this.storageData.progress.skills,
      plannedQuestions,
    });
    const config = mode === GAME_MODES.PRACTICE
      ? {
          durationMs: null,
          maxQuestions,
          dangerEnabled: false,
          gameOverEnabled: false,
        }
      : { maxQuestions };
    const game = new GameState({
      mode,
      config,
      sessionId: createSessionId(),
      contentVersion,
      clientVersion: CLIENT_VERSION,
      sessionQueue: queue,
    });
    game.beginReady(performance.now());

    this.activeSession = {
      game,
      mode,
      options: { ...options },
      seed,
      expected: "",
      problemToken: 0,
      pendingNextAt: null,
      finishHandled: false,
      rivals: { kind: "loading", entries: [] },
      lastRivalScore: null,
      lastCompetitionScore: 0,
      level2Prerequisites: { ...(this.storageData.progress.level2Prerequisites ?? {}) },
    };
    this.lastSessionSetup = { mode, options: { ...options } };
    this.finishDestination = "result";
    this.prepareGameScreen(mode, options);
    this.router.show("game", { focus: false });
    this.frameId = requestAnimationFrame((time) => this.frame(time));
    this.loadGameRivals(game.sessionId);
  }

  prepareGameScreen(mode, options = {}) {
    const labels = {
      [GAME_MODES.QUICK]: "QUICK PLAY",
      [GAME_MODES.DAILY]: "DAILY TRAINING",
      [GAME_MODES.PRACTICE]: "PRACTICE",
    };
    const modeLabel = options.beginnerGuide
      ? "BEGINNER GUIDE · 50 PRACTICAL SNIPPETS"
      : options.sampleLogic ? "SAMPLE LOGIC" : labels[mode];
    $("#screen-game").dataset.beginnerGuide = String(Boolean(options.beginnerGuide));
    $("#practice-layout-toggle").hidden = !options.beginnerGuide;
    this.applyPracticeLayout(this.storageData?.settings.practiceLayout);
    $("#game-mode-label").textContent = modeLabel;
    $("#skip-button").hidden = mode !== GAME_MODES.PRACTICE;
    $("#ready-mode").textContent = modeLabel;
    $("#ready-count").textContent = mode === GAME_MODES.PRACTICE ? "GO" : "3";
    $("#ready-overlay").hidden = false;
    $("#typing-input").disabled = true;
    $("#typing-input").value = "";
    $("#feedback-message").textContent = "";
    renderTypingFeedback("", "");
    renderBattleCompetition({ competitors: [], score: 0 });
    resetOvertakeEffect();
    renderPracticeRivals({ kind: mode === GAME_MODES.PRACTICE ? "loading" : "hidden", score: 0 });
    this.renderActiveHud();
  }

  frame(now) {
    this.frameId = null;
    const session = this.activeSession;
    if (!session || session.finishHandled) return;

    try {
      this.lastFrameTime = now;
      const status = session.game.tick(now);
      const snapshot = session.game.snapshot(now);
      this.renderActiveHud(snapshot);

      if (snapshot.phase === "ready") {
        $("#ready-overlay").hidden = false;
        $("#ready-count").textContent = String(Math.max(1, Math.ceil((status.readyRemainingMs ?? 0) / 1_000)));
      } else if (snapshot.phase === "playing") {
        $("#ready-overlay").hidden = true;
        if ($("#pause-dialog").open && snapshot.pauseReasons.length === 0) $("#pause-dialog").close();
        if (!snapshot.currentQuestion && session.pendingNextAt === null) {
          this.startNextQuestion(now);
        } else if (!snapshot.currentQuestion && now >= session.pendingNextAt) {
          session.pendingNextAt = null;
          this.startNextQuestion(now);
        }
      } else if (snapshot.phase === "paused") {
        $("#typing-input").disabled = true;
        this.updatePauseDialog(snapshot);
      } else if (snapshot.phase === "ended") {
        this.finishSession();
        return;
      }
    } catch {
      this.recoverFromRuntimeError();
      return;
    }
    if (this.activeSession && !this.activeSession.finishHandled) {
      this.frameId = requestAnimationFrame((time) => this.frame(time));
    }
  }

  renderActiveHud(snapshot = this.activeSession?.game.snapshot(performance.now())) {
    if (!snapshot || !this.activeSession) return;
    const currentScore = Number(snapshot.rawScore ?? 0);
    renderHud({
      ...snapshot,
      maxProblems: this.activeSession.game.maxProblems,
      remainingMs: snapshot.remainingMs,
    }, { formatTime: formatClock });
    const competitors = mergeCompetitionPlayers({
      rivals: this.activeSession.rivals.entries,
      onlinePlayers: this.latestOnlinePlayers,
      playerName: this.storageData?.profile?.nickname ?? "",
    });
    const overtaken = findOvertakenCompetitors(
      competitors,
      this.activeSession.lastCompetitionScore,
      currentScore,
    );
    renderBattleCompetition({ competitors, score: currentScore });
    if (triggerOvertakeEffect(overtaken)) {
      const names = overtaken.map((entry) => entry.playerName);
      announce(`${names.join(", ")} 추월 성공`, { clearAfterMs: 1_200 });
    }
    this.activeSession.lastCompetitionScore = currentScore;
    if (this.activeSession.mode === GAME_MODES.PRACTICE
        && this.activeSession.lastRivalScore !== currentScore) {
      this.activeSession.lastRivalScore = currentScore;
      renderPracticeRivals({
        ...this.activeSession.rivals,
        score: this.activeSession.lastRivalScore,
      });
    }
  }

  applyLevel2Prerequisite(question, session) {
    const key = level2PrerequisiteKey(question);
    return createLevel2PrerequisiteQuestion(question, session.level2Prerequisites[key]);
  }

  startNextQuestion(now) {
    const session = this.activeSession;
    if (!session || session.game.phase !== "playing") return;
    const selected = session.game.sessionQueue.next({ skills: session.options.skills });
    if (!selected) {
      session.game.end("completed", now);
      return;
    }
    const question = this.applyLevel2Prerequisite(selected, session);
    if (!session.game.startProblem(question, now)) return;
    session.expected = renderQuestion(question, { timed: session.game.remainingMs !== null });
    session.isBeginnerGuide = question.tags?.includes("beginner-guide") === true;
    session.concealPending = question.level === 2 || session.isBeginnerGuide;
    session.problemToken = session.game.problemToken;
    const input = $("#typing-input");
    input.value = "";
    input.disabled = false;
    $("#feedback-message").textContent = "";
    renderTypingFeedback(session.expected, "", {
      concealPending: session.concealPending,
      renderOnReference: session.isBeginnerGuide,
    });
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
  }

  handleTypingKey(event) {
    const session = this.activeSession;
    if (!session || session.game.phase !== "playing" || $("#typing-input").disabled || this.isComposing) return;
    if (event.key === "Tab" && (event.shiftKey || session.game.currentQuestion?.level === 2)) return;
    if (event.key === "Enter") {
      const problemResult = session.game.submitIncorrectProblem(
        performance.now(),
        session.problemToken,
      );
      if (problemResult) {
        event.preventDefault();
        this.processTypingOutcome({ submittedIncorrect: true, problemResult });
        return;
      }
    }
    const printable = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
    const handled = printable || ["Backspace", "Enter", "Tab"].includes(event.key);
    if (!handled) return;
    event.preventDefault();
    const outcome = session.game.handleKey(event, performance.now(), session.problemToken);
    this.processTypingOutcome(outcome);
  }

  handleBeforeInput(event) {
    const session = this.activeSession;
    if (!session || session.game.phase !== "playing" || $("#typing-input").disabled || this.isComposing || event.isComposing) return;
    event.preventDefault();
    const outcome = session.game.handleBeforeInput(event, performance.now(), session.problemToken);
    if (outcome.blocked) {
      this.showTypingFeedback("붙여넣기·drop·자동완성은 사용할 수 없습니다.");
      return;
    }
    this.processTypingOutcome(outcome);
  }

  handleCompositionEnd(event) {
    const session = this.activeSession;
    this.isComposing = false;
    if (!session || session.game.phase !== "playing" || $("#typing-input").disabled) return;
    const outcome = session.game.compositionEnd(event.data ?? "", performance.now(), session.problemToken);
    this.processTypingOutcome(outcome);
  }

  processTypingOutcome(outcome) {
    const session = this.activeSession;
    if (!session || outcome?.staleProblemEvent) return;
    const snapshot = session.game.snapshot(performance.now());
    const inputValue = snapshot.typing?.input ?? outcome?.input ?? "";
    const feedbackAnswer = selectFeedbackAnswer(
      inputValue,
      snapshot.typing?.acceptedAnswers,
      session.expected,
    );
    $("#typing-input").value = inputValue;
    renderTypingFeedback(feedbackAnswer, inputValue, {
      concealPending: session.concealPending
        || snapshot.currentQuestion?.level === 2
        || outcome?.problemResult?.level === 2,
      renderOnReference: session.isBeginnerGuide,
    });
    this.renderActiveHud(snapshot);

    if (outcome?.errors > 0) {
      this.showTypingFeedback(outcome.timeAdjustmentMs < 0
        ? "TYPO · TIME -2s · COMBO RESET"
        : outcome.firstError ? "TYPO · COMBO RESET" : "TYPO · 지우고 고치세요");
      announce("오타. 지우고 다시 입력하세요.", { clearAfterMs: 700 });
    }
    if (outcome?.ended) {
      $("#typing-input").disabled = true;
      return;
    }
    if (outcome?.problemResult) {
      $("#typing-input").disabled = true;
      if (outcome.submittedIncorrect || outcome.problemResult.submittedIncorrect) {
        this.showTypingFeedback("MISS · 오답으로 기록했습니다. 다음 문제로 이동합니다.", "warning");
        announce("오답으로 기록했습니다. 다음 문제로 이동합니다.", { clearAfterMs: 700 });
        if (session.game.phase === "playing") {
          session.pendingNextAt = performance.now() + NEXT_QUESTION_DELAY_MS;
        }
        return;
      }
      const clean = outcome.problemResult.cleanSolve;
      if (outcome.problemResult.questionId.startsWith("preview.")) {
        session.level2Prerequisites = recordLevel2Prerequisite(
          outcome.problemResult,
          session.level2Prerequisites,
        );
      }
      this.showTypingFeedback(outcome.problemResult.level === 2 && outcome.timeAdjustmentMs > 0
        ? `${clean ? "CLEAN" : "CORRECTED"} HIT · TIME +3s`
        : clean ? "CLEAN HIT" : "CORRECTED HIT", clean ? "success" : "warning");
      triggerAttack({ clean });
      announce(clean ? "정확한 입력입니다." : "수정 후 완료했습니다.", { clearAfterMs: 700 });
      if (session.game.phase === "playing") {
        session.pendingNextAt = performance.now() + NEXT_QUESTION_DELAY_MS;
      }
    }
  }

  restoreAuthoritativeInput() {
    if (this.isComposing) return;
    const session = this.activeSession;
    if (!session?.game.currentQuestion) return;
    const value = session.game.snapshot(performance.now()).typing?.input ?? "";
    if ($("#typing-input").value !== value) $("#typing-input").value = value;
  }

  blockInjectedInput(event) {
    if (!this.activeSession) return;
    event.preventDefault();
    this.showTypingFeedback("붙여넣기와 drop은 게임 입력에서 차단됩니다.");
    announce("붙여넣기는 사용할 수 없습니다.");
  }

  showTypingFeedback(message, kind = "error") {
    const node = $("#feedback-message");
    node.textContent = message;
    node.dataset.kind = kind;
  }

  pauseManually() {
    const session = this.activeSession;
    if (!session || session.game.phase !== "playing") return;
    if (!session.game.pause("manual", performance.now())) {
      this.showTypingFeedback("Quick Play 수동 일시정지는 한 번만 사용할 수 있습니다.");
      return;
    }
    this.showPauseDialog("manual");
  }

  skipPracticeQuestion() {
    const session = this.activeSession;
    if (!session || session.mode !== GAME_MODES.PRACTICE || session.game.phase !== "playing") return;
    const result = session.game.skipCurrentProblem(performance.now());
    if (!result) return;
    $("#typing-input").disabled = true;
    this.showTypingFeedback("SKIPPED · 복습 문제로 다시 나옵니다.", "warning");
    announce("문제를 건너뛰었습니다. 오답으로 기록합니다.");
    session.pendingNextAt = performance.now() + NEXT_QUESTION_DELAY_MS;
    this.renderActiveHud();
  }

  showPauseDialog(kind) {
    const dialog = $("#pause-dialog");
    $("#pause-kind").textContent = kind === "visibility" ? "TAB FOCUS PAUSED" : "SESSION PAUSED";
    $("#pause-message").textContent = kind === "visibility"
      ? "탭을 벗어난 동안 모든 시간이 멈췄습니다. 준비되면 재개하세요."
      : "타이머, 위험도, WPM 시간이 모두 멈춰 있습니다.";
    if (!dialog.open) dialog.showModal();
    this.updatePauseDialog(this.activeSession?.game.snapshot(performance.now()));
  }

  updatePauseDialog(snapshot) {
    if (!snapshot || !this.activeSession) return;
    const seconds = Math.floor(snapshot.accumulatedPauseMs / 1_000);
    const ranked = this.activeSession.mode === GAME_MODES.QUICK;
    $("#pause-limit").textContent = ranked
      ? `랭크 일시정지 누적 ${String(seconds).padStart(2, "0")} / 30초${snapshot.rankEligible ? "" : " · UNRANKED"}`
      : `일시정지 누적 ${String(seconds).padStart(2, "0")}초 · 비랭크 모드`;
    if (!$("#pause-dialog").open && snapshot.phase === "paused" && !document.hidden) {
      this.showPauseDialog(snapshot.pauseReasons.includes("visibility") ? "visibility" : "manual");
    }
  }

  resumeSession() {
    const session = this.activeSession;
    if (!session) return;
    const reasons = session.game.snapshot(performance.now()).pauseReasons;
    for (const reason of reasons) session.game.resume(reason, performance.now());
    if ($("#pause-dialog").open) $("#pause-dialog").close();
    $("#typing-input").disabled = session.game.phase !== "playing" || !session.game.currentQuestion;
    if (!$("#typing-input").disabled) $("#typing-input").focus({ preventScroll: true });
    announce("게임을 재개합니다.");
  }

  handleVisibilityChange() {
    const session = this.activeSession;
    if (!session || session.game.phase === "ended") return;
    if (document.hidden) {
      session.game.setVisibility(true, performance.now());
      $("#typing-input").disabled = true;
    } else if (session.game.snapshot(performance.now()).pauseReasons.includes("visibility")) {
      this.showPauseDialog("visibility");
    }
  }

  quitSession() {
    const session = this.activeSession;
    if (!session) return;
    this.finishDestination = "home";
    session.game.end("quit", performance.now());
    if ($("#pause-dialog").open) $("#pause-dialog").close();
    this.finishSession();
  }

  finishSession() {
    const session = this.activeSession;
    if (!session || session.finishHandled) return;
    session.finishHandled = true;
    this.cancelFrame();
    resetOvertakeEffect();
    $("#ready-overlay").hidden = true;
    $("#typing-input").disabled = true;
    if ($("#pause-dialog").open) $("#pause-dialog").close();

    const result = session.game.getResult(performance.now());
    const before = this.storage.read();
    const updatedSkills = { ...before.progress.skills };
    for (const problemResult of result.problemResults) {
      updatedSkills[problemResult.skill] = updateSkillMastery(
        updatedSkills[problemResult.skill] ?? createEmptySkillMastery(),
        problemResult,
      );
    }
    const weakSkills = getWeakSkills(updatedSkills, 3);
    const previousBest = before.personalBest[result.gameMode] ?? null;
    const isPersonalBest = result.endedNormally
      && (result.gameMode === GAME_MODES.QUICK || result.gameMode === GAME_MODES.DAILY)
      && isBetterResult(result, previousBest);
    const record = {
      ...result,
      playerName: before.profile.nickname,
      weakSkills,
      isPersonalBest,
    };

    const saved = this.storage.update((state) => {
      state.progress.skills = updatedSkills;
      state.progress.level2Prerequisites = { ...session.level2Prerequisites };
      state.history.push(record);
      if (isPersonalBest) state.personalBest[result.gameMode] = record;
    });
    this.storageData = saved.ok ? this.storage.read() : before;
    this.lastSessionRecord = record;
    this.activeSession = null;
    renderPracticeRivals({ kind: "hidden", score: 0 });

    if (this.finishDestination === "home") {
      this.router.show("home");
      return;
    }
    renderResult(record, { formatTime: formatElapsed });
    renderRankingSubmission({ kind: result.gameMode === GAME_MODES.QUICK ? "submitting" : "local" });
    this.router.show("result");
    if (isRankingPayloadEligible(record)) {
      this.submitLastRanking();
    } else if (result.gameMode === GAME_MODES.QUICK) {
      renderRankingSubmission({ kind: "ineligible" });
    }
  }

  async submitLastRanking() {
    const record = this.lastSessionRecord;
    if (!record || !isRankingPayloadEligible(record)) {
      renderRankingSubmission({ kind: "ineligible" });
      return;
    }
    renderRankingSubmission({ kind: "submitting" });
    const outcome = await this.ranking.submitRanking(record);
    if (!outcome.ok) {
      renderRankingSubmission({ kind: outcome.status === "offline" ? "offline" : outcome.status === "invalid" ? "ineligible" : "error" });
      this.updateNetworkStatus(outcome.status === "offline" ? "offline" : "error");
      return;
    }
    this.updateNetworkStatus("online");
    const rankResult = await this.ranking.getMyRank({
      sessionId: record.sessionId,
      contentVersion: record.contentVersion,
    });
    renderRankingSubmission({
      kind: outcome.duplicate ? "duplicate" : "success",
      rank: rankResult.ok ? rankResult.entry?.rank : null,
    });
  }

  playAgain() {
    if (!this.lastSessionSetup) return this.requestSessionStart(GAME_MODES.QUICK);
    this.requestSessionStart(this.lastSessionSetup.mode, this.lastSessionSetup.options);
  }

  getSkillIds() {
    return new Set(this.repository?.getSkills().map((skill) => skill.id) ?? []);
  }

  getCompetitiveContentVersion() {
    return `${this.repository.contentVersion}-r2`;
  }

  async refreshSharedQuestions() {
    if (!this.repository) return { ok: false, status: "invalid" };
    if (this.sharedContentRequest) return this.sharedContentRequest;
    this.sharedContentRequest = this.communityContent.getQuestions({
      contentVersion: this.repository.contentVersion,
      skillIds: this.getSkillIds(),
    });
    try {
      const result = await this.sharedContentRequest;
      if (result.ok) this.sharedQuestions = [...result.questions];
      if (this.router.current === "questions") this.renderQuestionEditorSources();
      return result;
    } finally {
      this.sharedContentRequest = null;
    }
  }

  mergeSharedPracticeQuestions(officialPool, selectedSkills) {
    const skillFilter = selectedSkills ? new Set(selectedSkills) : null;
    const overrides = new Map(this.sharedQuestions.map((question) => [question.id, question]));
    const result = officialPool.map((question) => {
      const shared = overrides.get(question.sourceId);
      if (!shared) return question;
      overrides.delete(question.sourceId);
      return this.toRuntimeSharedQuestion(shared);
    });
    for (const question of overrides.values()) {
      if (!skillFilter || skillFilter.has(question.skill)) result.push(this.toRuntimeSharedQuestion(question));
    }
    return result;
  }

  toRuntimeSharedQuestion(question) {
    return Object.freeze({
      id: question.id,
      instanceId: question.id,
      sourceId: question.id,
      seed: null,
      contentVersion: question.contentVersion,
      level: question.level,
      type: question.type,
      skill: question.skill,
      difficulty: question.difficulty,
      code: question.code,
      output: question.output,
      outputMode: question.outputMode,
      answer: question.answer,
      acceptedAnswers: Object.freeze([...question.acceptedAnswers]),
      targetSeconds: question.targetSeconds,
      tags: Object.freeze([...question.tags]),
    });
  }

  async loadGameRivals(sessionId) {
    const result = await this.ranking.getNearbyRanking({
      contentVersion: this.getCompetitiveContentVersion(),
      radius: 5,
    });
    const session = this.activeSession;
    if (!session || session.game.sessionId !== sessionId) return;
    session.rivals = result.ok
      ? { kind: result.entries.length > 0 ? "ready" : "empty", entries: result.entries }
      : { kind: result.status === "offline" ? "offline" : "error", entries: [] };
    if (session.mode === GAME_MODES.PRACTICE) session.lastRivalScore = null;
    this.renderActiveHud();
  }

  async openQuestionEditor() {
    if (!this.repository) return this.showRecoverableError("콘텐츠를 먼저 불러와야 합니다.");
    const skillSelect = $("#question-skill-input");
    if (skillSelect.options.length === 0) {
      for (const skill of this.repository.getSkills()) {
        const option = document.createElement("option");
        option.value = skill.id;
        option.textContent = `${skill.label} · ${skill.id}`;
        skillSelect.append(option);
      }
    }
    this.router.show("questions");
    $("#question-editor-message").textContent = "공유 문제를 불러오는 중입니다…";
    const result = await this.refreshSharedQuestions();
    $("#question-editor-message").textContent = result.ok
      ? ""
      : "온라인 공유 문제를 불러오지 못했습니다. 연결을 확인하세요.";
    this.renderQuestionEditorSources();
  }

  getEditableQuestionMap() {
    const sources = new Map(this.repository.getStaticSources().map((question) => [question.id, question]));
    for (const question of this.sharedQuestions) sources.set(question.id, question);
    return sources;
  }

  renderQuestionEditorSources() {
    const sources = [...this.getEditableQuestionMap().values()]
      .sort((left, right) => left.skill.localeCompare(right.skill) || left.id.localeCompare(right.id));
    renderQuestionSourceOptions(sources, new Set(this.sharedQuestions.map((question) => question.id)));
    this.resetQuestionForm();
  }

  selectQuestionSource() {
    const id = $("#question-source").value;
    const question = id ? this.getEditableQuestionMap().get(id) : null;
    fillQuestionForm(question);
    updateQuestionFormLevel();
    $("#question-editor-message").textContent = question
      ? `${id}의 새 revision을 작성합니다.`
      : "새 공유 문제를 작성합니다.";
  }

  resetQuestionForm() {
    $("#question-source").value = "";
    fillQuestionForm(null);
    updateQuestionFormLevel();
    $("#question-editor-message").textContent = "새 공유 문제를 작성합니다.";
  }

  async saveSharedQuestion(event) {
    event.preventDefault();
    const message = $("#question-editor-message");
    const level = Number($("#question-level-input").value);
    const code = $("#question-code-input").value.replaceAll("\r\n", "\n");
    const answer = level === 1 ? code : $("#question-answer-input").value;
    const question = {
      level,
      type: level === 1 ? "copy" : "fill",
      skill: $("#question-skill-input").value,
      difficulty: 1,
      code,
      output: level === 1 ? "" : $("#question-output-input").value.replaceAll("\r\n", "\n"),
      outputMode: "exact",
      answer,
      acceptedAnswers: [answer],
      targetSeconds: Number($("#question-target-input").value),
      tags: ["community"],
    };
    message.textContent = "검증 후 모든 사용자에게 저장하는 중입니다…";
    const result = await this.communityContent.saveQuestion({
      questionId: $("#question-source").value || null,
      question,
      contentVersion: this.repository.contentVersion,
      skillIds: this.getSkillIds(),
    });
    if (!result.ok) {
      message.textContent = result.status === "invalid"
        ? "형식을 확인하세요. Level 1은 1~3줄, Level 2는 _____ 한 곳과 OUTPUT이 필요합니다."
        : result.status === "offline"
          ? "오프라인에서는 전역 저장할 수 없습니다. Practice는 계속 사용할 수 있습니다."
          : "저장하지 못했습니다. 잠시 기다린 뒤 다시 시도하세요.";
      return;
    }
    await this.refreshSharedQuestions();
    this.renderQuestionEditorSources();
    $("#question-source").value = result.questionId;
    this.selectQuestionSource();
    message.textContent = "저장 완료 · 모든 사용자의 Practice에 최신 revision이 적용됩니다.";
    announce("공유 문제를 저장했습니다.");
  }

  startPresenceLoop() {
    if (this.presenceTimer !== null) return;
    renderOnlinePlayers({ kind: "loading", players: [] });
    this.refreshPresence();
    this.presenceTimer = window.setInterval(() => this.refreshPresence(), PRESENCE_REFRESH_MS);
  }

  async refreshPresence() {
    if (!this.repository || document.hidden || navigator.onLine === false) return;
    const nickname = this.storage.read().profile.nickname;
    if (nickname) await this.presence.heartbeat(nickname);
    const result = await this.presence.getOnlinePlayers({
      contentVersion: this.getCompetitiveContentVersion(),
      limit: 50,
    });
    const viewState = result.ok
      ? { kind: result.players.length > 0 ? "ready" : "empty", players: result.players }
      : { kind: result.status === "offline" ? "offline" : "error", players: [] };
    this.latestOnlinePlayers = result.ok ? result.players : [];
    renderOnlinePlayers(viewState);
    if (this.activeSession) this.renderActiveHud();
  }

  openProgress() {
    const data = this.storage.read();
    const allSkills = Object.fromEntries(
      this.repository.getSkills().map((skill) => [
        skill.id,
        data.progress.skills[skill.id] ?? createEmptySkillMastery(),
      ]),
    );
    renderProgress(allSkills, data.history);
    this.router.show("progress");
  }

  openSettings() {
    this.storageData = this.storage.read();
    this.applyProfileToUi();
    $("#settings-message").textContent = "";
    this.router.show("settings");
  }

  saveSettings(event) {
    event.preventDefault();
    const nickname = validateNickname($("#settings-nickname").value);
    const message = $("#settings-message");
    if (!nickname.valid) {
      message.textContent = nickname.message;
      return;
    }
    const fontScale = Number($("#settings-font-scale").value);
    const result = this.storage.update((state) => {
      state.profile.nickname = nickname.value;
      state.settings.reducedMotion = $("#settings-motion").checked;
      state.settings.fontScale = fontScale;
    });
    message.textContent = result.ok ? "설정을 저장했습니다." : "설정을 저장하지 못했습니다.";
    if (result.ok) {
      this.storageData = this.storage.read();
      this.applyProfileToUi();
      announce("설정을 저장했습니다.");
      this.refreshPresence();
    }
  }

  resetLocalData() {
    this.storage.reset({ confirmed: true });
    this.supabase.clearSession();
    this.storageData = this.storage.read();
    this.lastSessionRecord = null;
    $("#reset-dialog").close();
    this.applyProfileToUi();
    this.router.show("home");
    $("#nickname-input").value = "";
    $("#nickname-dialog").showModal();
  }

  openRanking() {
    this.router.show("ranking");
    this.loadRanking(this.currentRankingTab);
  }

  handleRankingTabKey(event) {
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    const tabs = $all("[data-ranking-tab]");
    const current = tabs.indexOf(event.currentTarget);
    const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const next = tabs[(current + direction + tabs.length) % tabs.length];
    next.focus();
    this.loadRanking(next.dataset.rankingTab);
  }

  async loadRanking(tabName) {
    this.currentRankingTab = tabName;
    selectRankingTab(tabName);
    renderRankingState("loading");
    const requestToken = ++this.rankingRequestToken;
    const contentVersion = this.getCompetitiveContentVersion();
    let response;
    if (tabName === "today") {
      response = await this.ranking.getTodayRanking({ limit: 100, contentVersion });
    } else if (tabName === "mine") {
      response = await this.ranking.getMyBest({ contentVersion });
    } else {
      response = await this.ranking.getGlobalRanking({ limit: 100, contentVersion });
    }
    if (requestToken !== this.rankingRequestToken) return;

    if (tabName === "mine") {
      const local = localResultToRankingRow(this.storage.read().personalBest.quick);
      const rows = [];
      if (response.ok && response.entry) rows.push(response.entry);
      if (local && (!response.ok || !response.entry || Number(local.score) !== Number(response.entry.score))) rows.push(local);
      if (rows.length > 0) {
        renderRankingState("ready", { rows });
      } else {
        renderRankingState(response.ok ? "empty" : response.status === "offline" ? "offline" : "error");
      }
      return;
    }

    if (!response.ok) {
      renderRankingState(response.status === "offline" ? "offline" : "error");
      return;
    }
    if (response.entries.length === 0) {
      renderRankingState("empty");
      return;
    }
    const rows = [...response.entries];
    if (tabName === "global") {
      const best = this.storage.read().personalBest.quick;
      if (best?.sessionId) {
        const myRank = await this.ranking.getMyRank({ sessionId: best.sessionId, contentVersion });
        if (requestToken !== this.rankingRequestToken) return;
        if (myRank.ok && myRank.entry && !rows.some((entry) => (
          entry.rank === myRank.entry.rank && entry.score === myRank.entry.score && entry.createdAt === myRank.entry.createdAt
        ))) {
          rows.push({ ...myRank.entry, isCurrentUser: true });
        }
      }
    }
    renderRankingState("ready", { rows });
  }

  async connectRankingInBackground() {
    if (!this.ranking.isOnlineRankingAvailable() || navigator.onLine === false) {
      this.updateNetworkStatus("offline");
      return;
    }
    this.updateNetworkStatus("connecting");
    try {
      await this.supabase.ensureAnonymousSession();
      this.updateNetworkStatus("online");
      await this.ranking.retryPendingSubmissions();
      this.refreshPresence();
    } catch {
      this.updateNetworkStatus("offline");
    }
  }

  updateNetworkStatus(status) {
    const badge = $("#network-badge");
    badge.dataset.status = status === "online" ? "online" : status === "error" ? "error" : "offline";
    const labels = {
      online: "RANKING ONLINE",
      connecting: "RANKING CONNECTING",
      offline: "RANKING OFFLINE",
      error: "RANKING ERROR",
    };
    $("#network-label").textContent = labels[status] ?? labels.offline;
  }

  goHome() {
    if (this.activeSession) {
      this.finishDestination = "home";
      this.activeSession.game.end("quit", performance.now());
      this.finishSession();
      return;
    }
    this.router.show("home");
  }

  cancelFrame() {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  showRecoverableError(message) {
    $("#error-message").textContent = message;
    this.router.show("error");
  }

  recoverFromRuntimeError() {
    if (this.activeSession) {
      this.activeSession.game.end("error", performance.now());
      this.activeSession.finishHandled = true;
      this.activeSession = null;
    }
    this.cancelFrame();
    $("#ready-overlay").hidden = true;
    $("#typing-input").disabled = true;
    if ($("#pause-dialog").open) $("#pause-dialog").close();
    this.showRecoverableError("예상하지 못한 오류가 발생했습니다. 입력 잠금을 해제했으며 홈에서 새 세션을 시작할 수 있습니다.");
  }
}

const app = new PythonTypingSurvivalApp();
app.initialize().catch(() => {
  document.body.removeAttribute("aria-busy");
  app.showRecoverableError("앱을 초기화하지 못했습니다. 페이지를 새로고침하거나 다시 시도하세요.");
});
