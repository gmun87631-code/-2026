const CHOICES = {
  scissors: {
    key: "scissors",
    name: "가위",
    symbol: "✌",
    beats: "paper",
    losesTo: "rock",
    color: "#38bdf8",
    rule: "기준 패가 가위면 보를 낸 참가자가 탈락합니다.",
  },
  rock: {
    key: "rock",
    name: "바위",
    symbol: "●",
    beats: "scissors",
    losesTo: "paper",
    color: "#facc15",
    rule: "기준 패가 바위면 가위를 낸 참가자가 탈락합니다.",
  },
  paper: {
    key: "paper",
    name: "보",
    symbol: "▰",
    beats: "rock",
    losesTo: "scissors",
    color: "#4ade80",
    rule: "기준 패가 보면 바위를 낸 참가자가 탈락합니다.",
  },
};

const CHOICE_ORDER = ["scissors", "rock", "paper"];
const MAX_PLAYERS = 20;
const PATCH_VERSION = "2.5";
const AI_NAMES = [
  "민준",
  "서연",
  "도윤",
  "하린",
  "지우",
  "현우",
  "유나",
  "준서",
  "가온",
  "시우",
  "다은",
  "예준",
  "수아",
  "지민",
  "서준",
  "하윤",
  "은우",
  "채원",
  "도현",
];

function choiceName(choice) {
  return CHOICES[choice]?.name || "없음";
}

function choiceSymbol(choice) {
  return CHOICES[choice]?.symbol || "?";
}

function createCountMap(players) {
  return CHOICE_ORDER.reduce((counts, choice) => {
    counts[choice] = players.filter((player) => player.pick === choice).length;
    return counts;
  }, {});
}

function formatCounts(counts) {
  return `가위 ${counts.scissors}명 / 바위 ${counts.rock}명 / 보 ${counts.paper}명`;
}

function selectMayorFromVotes({ votes, candidates, voters = candidates, ineligibleCandidateIds = [], random = Math.random }) {
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const voterIds = new Set(voters.map((voter) => voter.id));
  const ineligibleIds = new Set(ineligibleCandidateIds);
  const tally = candidates.reduce((acc, candidate) => {
    acc[candidate.id] = 0;
    return acc;
  }, {});

  for (const vote of votes) {
    if (!voterIds.has(vote.voterId) || !candidateIds.has(vote.candidateId)) continue;
    if (vote.voterId === vote.candidateId) continue;
    tally[vote.candidateId] += 1;
  }

  const electableEntries = Object.entries(tally)
    .filter(([id]) => !ineligibleIds.has(Number(id)));
  const entriesForElection = electableEntries.length ? electableEntries : Object.entries(tally);
  const highest = Math.max(...entriesForElection.map(([, count]) => count));
  const topCandidateIds = entriesForElection
    .filter(([, count]) => count === highest)
    .map(([id]) => Number(id));
  const mayorId = topCandidateIds[Math.floor(random() * topCandidateIds.length)];

  return {
    mayorId,
    tally,
    tiedCandidateIds: topCandidateIds,
  };
}

function resolveMajorityRound({ players, mayorId, protectedIds = [], anonymousMayorId = null }) {
  const alivePlayers = players.filter((player) => player.alive);
  const counts = createCountMap(alivePlayers);
  const anonymousMayor = alivePlayers.find((player) => player.id === anonymousMayorId);
  if (anonymousMayor?.pick) counts[anonymousMayor.pick] += 1;
  const protectedSet = new Set(protectedIds);
  if (alivePlayers.length === 2 && protectedSet.size === 0) {
    const [first, second] = alivePlayers;
    let baseChoice = null;
    let losingChoice = null;
    let eliminatedIds = [];
    let reason = "최종 2인전에서는 시장 권한을 사용하지 않습니다.";

    if (!first.pick || !second.pick) {
      reason = "최종 2인전에서 선택하지 않은 참가자가 있어 아무도 탈락하지 않습니다.";
    } else if (first.pick === second.pick) {
      reason = "최종 2인전에서 두 참가자가 같은 패를 냈으므로 아무도 탈락하지 않습니다.";
    } else if (CHOICES[first.pick].beats === second.pick) {
      baseChoice = first.pick;
      losingChoice = second.pick;
      eliminatedIds = [second.id];
      reason = `최종 2인전: ${choiceName(first.pick)}가 ${choiceName(second.pick)}를 이겼습니다.`;
    } else {
      baseChoice = second.pick;
      losingChoice = first.pick;
      eliminatedIds = [first.id];
      reason = `최종 2인전: ${choiceName(second.pick)}가 ${choiceName(first.pick)}를 이겼습니다.`;
    }

    return {
      counts,
      topChoices: [],
      baseChoice,
      losingChoice,
      eliminatedIds,
      decidedByMayor: false,
      finalDuel: true,
      reason,
      mayorChoice: null,
    };
  }

  const maxCount = Math.max(...CHOICE_ORDER.map((choice) => counts[choice]));
  const topChoices = CHOICE_ORDER.filter((choice) => counts[choice] === maxCount);
  const usedChoices = CHOICE_ORDER.filter((choice) => counts[choice] > 0);
  const mayor = anonymousMayorId === null ? alivePlayers.find((player) => player.id === mayorId) : null;
  const mayorChoice = mayor?.pick || null;

  let baseChoice = null;
  let decidedByMayor = false;
  let reason = "";

  if (usedChoices.length === 1) {
    reason = "모든 생존자가 같은 패를 냈으므로 아무도 탈락하지 않습니다.";
  } else if (topChoices.length === 1) {
    baseChoice = topChoices[0];
    reason = `단독 최다 선택 패인 ${choiceName(baseChoice)}가 기준 패입니다.`;
  } else if (mayorChoice && topChoices.includes(mayorChoice)) {
    baseChoice = mayorChoice;
    decidedByMayor = true;
    reason = "시장 권한으로 기준 패가 결정되었습니다.";
  } else {
    reason = anonymousMayorId !== null
      ? "최다 선택 패가 동률이라 기준 패를 정하지 못했습니다."
      : "최다 선택 패가 동률이고 시장의 선택이 동률 후보에 없어 기준 패를 정하지 못했습니다.";
  }

  const losingChoice = baseChoice ? CHOICES[baseChoice].beats : null;
  const eliminatedIds = baseChoice
    ? alivePlayers
      .filter((player) => player.pick === losingChoice && !protectedSet.has(player.id))
      .map((player) => player.id)
    : [];

  return {
    counts,
    topChoices,
    baseChoice,
    losingChoice,
    eliminatedIds,
    decidedByMayor,
    reason,
    mayorChoice,
  };
}

class BgmPlayer {
  constructor() {
    this.context = null;
    this.master = null;
    this.timer = null;
    this.step = 0;
    this.playing = false;
    this.scale = [261.63, 293.66, 329.63, 392, 440, 392, 329.63, 293.66];
  }

  async toggle() {
    if (this.playing) {
      this.stop();
      return false;
    }

    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.12;
      this.master.connect(this.context.destination);
    }

    await this.context.resume();
    this.playing = true;
    this.playBeat();
    this.timer = window.setInterval(() => this.playBeat(), 380);
    return true;
  }

  async ensureContext() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.12;
      this.master.connect(this.context.destination);
    }
    await this.context.resume();
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
  }

  async playGunshot() {
    await this.ensureContext();
    const now = this.context.currentTime;
    const duration = 1.35;
    const sampleRate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i += 1) {
      const progress = i / data.length;
      const crack = progress < 0.012 ? 1.55 : Math.exp(-progress * 18);
      const desertTail = Math.exp(-progress * 2.55) * 0.22;
      const flutter = Math.sin(progress * 1900) * Math.exp(-progress * 7) * 0.08;
      data[i] = ((Math.random() * 2 - 1) * (crack + desertTail)) + flutter;
    }

    const noise = this.context.createBufferSource();
    const noiseGain = this.context.createGain();
    const crackFilter = this.context.createBiquadFilter();
    const bodyFilter = this.context.createBiquadFilter();
    const compressor = this.context.createDynamicsCompressor();
    const delay = this.context.createDelay(1.2);
    const feedback = this.context.createGain();
    const echoGain = this.context.createGain();

    crackFilter.type = "bandpass";
    crackFilter.frequency.value = 1850;
    crackFilter.Q.value = 1.4;
    bodyFilter.type = "lowshelf";
    bodyFilter.frequency.value = 230;
    bodyFilter.gain.value = 8;
    compressor.threshold.value = -26;
    compressor.knee.value = 12;
    compressor.ratio.value = 10;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.42;
    delay.delayTime.value = 0.23;
    feedback.gain.value = 0.38;
    echoGain.gain.value = 0.34;

    noise.buffer = buffer;
    noiseGain.gain.setValueAtTime(1.2, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    noise.connect(crackFilter);
    crackFilter.connect(bodyFilter);
    bodyFilter.connect(compressor);
    compressor.connect(noiseGain);
    noiseGain.connect(this.master);
    noiseGain.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(echoGain);
    echoGain.connect(this.master);
    noise.start(now);
    noise.stop(now + duration);

    this.playTone(52, now, 0.32, "sine", 0.85);
    this.playTone(118, now + 0.008, 0.22, "sawtooth", 0.42);
    this.playTone(760, now + 0.018, 0.11, "square", 0.18);
    this.playTone(46, now + 0.055, 0.52, "sine", 0.48);
    this.playTone(330, now + 0.24, 0.18, "triangle", 0.12);
    this.playTone(260, now + 0.48, 0.2, "triangle", 0.08);
  }

  async playBell() {
    await this.ensureContext();
    const now = this.context.currentTime;
    this.playTone(220, now, 1.2, "sine", 0.35);
    this.playTone(440, now + 0.01, 1.0, "triangle", 0.18);
    this.playTone(110, now + 0.03, 1.3, "sine", 0.22);
  }

  playBeat() {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const note = this.scale[this.step % this.scale.length];
    const harmony = this.scale[(this.step + 2) % this.scale.length] / 2;
    this.step += 1;
    this.playTone(note, now, 0.16, "triangle", 0.22);
    if (this.step % 2 === 0) this.playTone(harmony, now, 0.24, "sine", 0.15);
    if (this.step % 4 === 0) this.playKick(now);
  }

  playTone(frequency, start, duration, type, volume) {
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  playKick(start) {
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(110, start);
    osc.frequency.exponentialRampToValueAtTime(48, start + 0.14);
    gain.gain.setValueAtTime(0.3, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + 0.16);
  }
}

class SurvivalGame {
  constructor() {
    this.phase = "waiting";
    this.round = 1;
    this.players = [];
    this.mayorId = null;
    this.successorIds = [];
    this.successionDuel = null;
    this.assassinIds = [];
    this.assassinPowerUsedIds = [];
    this.assassinsAssigned = false;
    this.pendingSuccessorIds = [];
    this.pendingAssassinTargetId = null;
    this.pendingAssassinRole = null;
    this.revolutionaryId = null;
    this.revolutionPowerUsed = false;
    this.revolutionaryAssigned = false;
    this.candidateBlockTargetId = null;
    this.candidateBlockApplied = false;
    this.candidateBlockTimer = null;
    this.candidateBlockSecondsLeft = 0;
    this.pendingRevolutionTargetId = null;
    this.anonymousMayorId = null;
    this.anonymousMayorGraceUsed = false;
    this.pendingGraceTargetId = null;
    this.pendingEdictTargetId = null;
    this.edictTimer = null;
    this.edictSecondsLeft = 0;
    this.mayorSystemGone = false;
    this.maestroId = null;
    this.maestroAssigned = false;
    this.maestroTargetId = null;
    this.lastHypnosisApplied = false;
    this.resistance = null;
    this.resistanceTimer = null;
    this.shamanId = null;
    this.shamanAssigned = false;
    this.shamanStreak = 0;
    this.shamanSpent = false;
    this.deathSentenceReady = false;
    this.pendingRoundResult = null;
    this.pendingAnonymousMayorEliminated = false;
    this.pendingFateTargetId = null;
    this.fateTimer = null;
    this.fateSecondsLeft = 0;
    this.pendingDeathTargetId = null;
    this.deathTimer = null;
    this.deathSecondsLeft = 0;
    this.curseTimer = null;
    this.cupidId = null;
    this.cupidAssigned = false;
    this.cupidLoverIds = [];
    this.pendingCupidIds = [];
    this.cupidTimer = null;
    this.cupidSecondsLeft = 0;
    this.cupidAfterSelection = null;
    this.cupidNextSelectionRound = 1;
    this.cupidLoveDeaths = 0;
    this.loverSurvivalRounds = 0;
    this.loveDeathIds = [];
    this.sheriffId = null;
    this.sheriffAssigned = false;
    this.sheriffPowerUsed = false;
    this.pendingSheriffTargetId = null;
    this.clownId = null;
    this.clownAssigned = false;
    this.clownFailures = 0;
    this.clownIsJoker = false;
    this.clownPredictionRound = null;
    this.clownPrediction = null;
    this.pendingClownPrediction = {};
    this.judgeId = null;
    this.prosecutorId = null;
    this.defenderId = null;
    this.courtAssigned = false;
    this.courtActive = false;
    this.defendantId = null;
    this.acquittedIds = [];
    this.prosecutorSuccesses = 0;
    this.defenderSuccesses = 0;
    this.defenderFailures = 0;
    this.pendingCourtDefendantId = null;
    this.courtTimer = null;
    this.courtSecondsLeft = 0;
    this.prosecutorPick = null;
    this.defenderPick = null;
    this.guiltyIds = [];
    this.innocentIds = [];
    this.logs = [];
    this.lastResult = null;
    this.lastPlayerPick = null;
    this.autoTimer = null;
    this.nextPlayerId = 1;
    this.friends = this.loadFriends();
    this.bgm = new BgmPlayer();
    this.bindElements();
    this.bindEvents();
    this.reset(false);
    this.render();
  }

  bindElements() {
    this.choiceGrid = document.getElementById("choiceGrid");
    this.voteGrid = document.getElementById("voteGrid");
    this.playerGrid = document.getElementById("playerGrid");
    this.logList = document.getElementById("logList");
    this.roundValue = document.getElementById("roundValue");
    this.aliveValue = document.getElementById("aliveValue");
    this.mayorValue = document.getElementById("mayorValue");
    this.phaseValue = document.getElementById("phaseValue");
    this.resultBanner = document.getElementById("resultBanner");
    this.stageEyebrow = document.getElementById("stageEyebrow");
    this.stageTitle = document.getElementById("stageTitle");
    this.startButton = document.getElementById("startButton");
    this.patchNotesButton = document.getElementById("patchNotesButton");
    this.patchModal = document.getElementById("patchModal");
    this.closePatchButton = document.getElementById("closePatchButton");
    this.victoryModal = document.getElementById("victoryModal");
    this.victoryTitle = document.getElementById("victoryTitle");
    this.victoryText = document.getElementById("victoryText");
    this.closeVictoryButton = document.getElementById("closeVictoryButton");
    this.addAiButton = document.getElementById("addAiButton");
    this.lobbyPanel = document.getElementById("lobbyPanel");
    this.lobbyCount = document.getElementById("lobbyCount");
    this.musicButton = document.getElementById("musicButton");
    this.votePanel = document.getElementById("votePanel");
    this.choicePanel = document.getElementById("choicePanel");
    this.playerPick = document.getElementById("playerPick");
    this.basePick = document.getElementById("basePick");
    this.secretPanel = document.getElementById("secretPanel");
    this.secretTitle = document.getElementById("secretTitle");
    this.secretText = document.getElementById("secretText");
    this.successorPanel = document.getElementById("successorPanel");
    this.successorGrid = document.getElementById("successorGrid");
    this.successorHint = document.getElementById("successorHint");
    this.confirmSuccessorsButton = document.getElementById("confirmSuccessorsButton");
    this.inspectorPanel = document.getElementById("inspectorPanel");
    this.inspectorGrid = document.getElementById("inspectorGrid");
    this.inspectorHint = document.getElementById("inspectorHint");
    this.assassinRoleGrid = document.getElementById("assassinRoleGrid");
    this.confirmAssassinationButton = document.getElementById("confirmAssassinationButton");
    this.revolutionPanel = document.getElementById("revolutionPanel");
    this.revolutionTitle = document.getElementById("revolutionTitle");
    this.revolutionHint = document.getElementById("revolutionHint");
    this.revolutionGrid = document.getElementById("revolutionGrid");
    this.confirmRevolutionButton = document.getElementById("confirmRevolutionButton");
    this.gracePanel = document.getElementById("gracePanel");
    this.graceHint = document.getElementById("graceHint");
    this.graceGrid = document.getElementById("graceGrid");
    this.confirmGraceButton = document.getElementById("confirmGraceButton");
    this.maestroPanel = document.getElementById("maestroPanel");
    this.maestroHint = document.getElementById("maestroHint");
    this.maestroGrid = document.getElementById("maestroGrid");
    this.resistanceModal = document.getElementById("resistanceModal");
    this.resistanceTitle = document.getElementById("resistanceTitle");
    this.resistanceText = document.getElementById("resistanceText");
    this.resistanceTimerValue = document.getElementById("resistanceTimer");
    this.maestroTapCount = document.getElementById("maestroTapCount");
    this.targetTapCount = document.getElementById("targetTapCount");
    this.resistanceTapButton = document.getElementById("resistanceTapButton");
    this.shamanPanel = document.getElementById("shamanPanel");
    this.shamanTitle = document.getElementById("shamanTitle");
    this.shamanHint = document.getElementById("shamanHint");
    this.shamanGrid = document.getElementById("shamanGrid");
    this.confirmShamanButton = document.getElementById("confirmShamanButton");
    this.curseModal = document.getElementById("curseModal");
    this.curseTitle = document.getElementById("curseTitle");
    this.curseText = document.getElementById("curseText");
    this.cupidPanel = document.getElementById("cupidPanel");
    this.cupidHint = document.getElementById("cupidHint");
    this.cupidGrid = document.getElementById("cupidGrid");
    this.confirmCupidButton = document.getElementById("confirmCupidButton");
    this.sheriffPanel = document.getElementById("sheriffPanel");
    this.sheriffHint = document.getElementById("sheriffHint");
    this.sheriffGrid = document.getElementById("sheriffGrid");
    this.confirmSheriffButton = document.getElementById("confirmSheriffButton");
    this.clownPanel = document.getElementById("clownPanel");
    this.clownHint = document.getElementById("clownHint");
    this.clownGrid = document.getElementById("clownGrid");
    this.confirmClownButton = document.getElementById("confirmClownButton");
    this.skipClownButton = document.getElementById("skipClownButton");
    this.courtPanel = document.getElementById("courtPanel");
    this.courtTitle = document.getElementById("courtTitle");
    this.courtHint = document.getElementById("courtHint");
    this.courtGrid = document.getElementById("courtGrid");
    this.confirmCourtButton = document.getElementById("confirmCourtButton");
    this.friendForm = document.getElementById("friendForm");
    this.friendInput = document.getElementById("friendInput");
    this.friendList = document.getElementById("friendList");
  }

  bindEvents() {
    this.startButton.addEventListener("click", () => {
      if (this.phase === "over") {
        this.reset(true);
      } else if (this.phase === "waiting") {
        if (this.players.length < 2) {
          this.addLog("참가자가 2명 이상이어야 시작할 수 있습니다.");
        } else {
          this.prepareFirstElection();
        }
      }
      this.render();
    });

    this.patchNotesButton.addEventListener("click", () => {
      this.openPatchNotes();
    });

    this.closePatchButton.addEventListener("click", () => {
      this.closePatchNotes();
    });

    this.closeVictoryButton.addEventListener("click", () => {
      this.victoryModal.hidden = true;
    });

    this.confirmSuccessorsButton.addEventListener("click", () => {
      this.confirmHumanSuccessors();
    });

    this.confirmAssassinationButton.addEventListener("click", () => {
      this.useAssassination();
    });

    this.confirmRevolutionButton.addEventListener("click", () => {
      this.confirmRevolutionPanelAction();
    });

    this.confirmGraceButton.addEventListener("click", () => {
      this.useDivineGrace();
    });

    this.resistanceTapButton.addEventListener("click", () => {
      this.registerResistanceTap();
    });

    this.resistanceModal.addEventListener("click", (event) => {
      if (event.target !== this.resistanceTapButton) this.registerResistanceTap();
    });

    this.confirmShamanButton.addEventListener("click", () => {
      this.confirmShamanAction();
    });

    this.confirmCupidButton.addEventListener("click", () => {
      this.confirmCupidSelection();
    });

    this.confirmSheriffButton.addEventListener("click", () => {
      this.useSheriffJustice();
    });

    this.confirmClownButton.addEventListener("click", () => {
      this.confirmClownPrediction();
    });

    this.skipClownButton.addEventListener("click", () => {
      this.submitClownRoundWithoutPick();
    });

    this.confirmCourtButton.addEventListener("click", () => {
      if (this.phase === "choosing" && (this.human().id === this.defendantId || this.isCourtRole(this.human()))) {
        this.assignRoundPicks(null);
        this.prepareRoundResolution();
        return;
      }
      this.confirmCourtDefendant();
    });

    document.addEventListener("keydown", (event) => {
      if (event.code === "Space" && this.phase === "resistance") {
        event.preventDefault();
        this.registerResistanceTap();
      }
    });

    this.patchModal.addEventListener("click", (event) => {
      if (event.target === this.patchModal) this.closePatchNotes();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.patchModal.hidden) this.closePatchNotes();
    });

    this.addAiButton.addEventListener("click", () => {
      this.addAiPlayer();
    });

    this.musicButton.addEventListener("click", async () => {
      const playing = await this.bgm.toggle();
      this.addLog(playing ? "BGM이 재생 중입니다." : "BGM을 껐습니다.");
      this.renderMusicButton();
    });

    this.friendForm.addEventListener("submit", (event) => {
      event.preventDefault();
      this.addFriend(this.friendInput.value);
    });

    window.setTimeout(() => this.showPatchNotesOnce(), 250);
  }

  reset(clearLogs) {
    this.phase = "waiting";
    this.round = 1;
    this.mayorId = null;
    this.successorIds = [];
    this.successionDuel = null;
    this.assassinIds = [];
    this.assassinPowerUsedIds = [];
    this.assassinsAssigned = false;
    this.pendingAssassinTargetId = null;
    this.pendingAssassinRole = null;
    this.revolutionaryId = null;
    this.revolutionPowerUsed = false;
    this.revolutionaryAssigned = false;
    this.candidateBlockTargetId = null;
    this.candidateBlockApplied = false;
    this.candidateBlockSecondsLeft = 0;
    this.pendingRevolutionTargetId = null;
    this.anonymousMayorId = null;
    this.anonymousMayorGraceUsed = false;
    this.pendingGraceTargetId = null;
    this.pendingEdictTargetId = null;
    this.edictSecondsLeft = 0;
    this.mayorSystemGone = false;
    this.maestroId = null;
    this.maestroAssigned = false;
    this.maestroTargetId = null;
    this.lastHypnosisApplied = false;
    this.resistance = null;
    this.shamanId = null;
    this.shamanAssigned = false;
    this.shamanStreak = 0;
    this.shamanSpent = false;
    this.deathSentenceReady = false;
    this.pendingRoundResult = null;
    this.pendingAnonymousMayorEliminated = false;
    this.pendingFateTargetId = null;
    this.fateSecondsLeft = 0;
    this.pendingDeathTargetId = null;
    this.deathSecondsLeft = 0;
    this.clearCandidateBlockTimer();
    this.clearEdictTimer();
    this.clearResistanceTimer();
    this.clearFateTimer();
    this.clearDeathTimer();
    this.clearCurseTimer();
    this.cupidId = null;
    this.cupidAssigned = false;
    this.cupidLoverIds = [];
    this.pendingCupidIds = [];
    this.cupidSecondsLeft = 0;
    this.cupidAfterSelection = null;
    this.cupidNextSelectionRound = 1;
    this.cupidLoveDeaths = 0;
    this.loverSurvivalRounds = 0;
    this.loveDeathIds = [];
    this.sheriffId = null;
    this.sheriffAssigned = false;
    this.sheriffPowerUsed = false;
    this.pendingSheriffTargetId = null;
    this.clownId = null;
    this.clownAssigned = false;
    this.clownFailures = 0;
    this.clownIsJoker = false;
    this.clownPredictionRound = null;
    this.clownPrediction = null;
    this.pendingClownPrediction = {};
    this.judgeId = null;
    this.prosecutorId = null;
    this.defenderId = null;
    this.courtAssigned = false;
    this.courtActive = false;
    this.defendantId = null;
    this.acquittedIds = [];
    this.prosecutorSuccesses = 0;
    this.defenderSuccesses = 0;
    this.defenderFailures = 0;
    this.pendingCourtDefendantId = null;
    this.courtSecondsLeft = 0;
    this.prosecutorPick = null;
    this.defenderPick = null;
    this.guiltyIds = [];
    this.innocentIds = [];
    this.clearCourtTimer();
    this.clearCupidTimer();
    this.lastResult = null;
    this.lastPlayerPick = null;
    this.nextPlayerId = 1;
    this.clearAutoTimer();
    this.players = [{
      id: 0,
      name: "나",
      alive: true,
      isHuman: true,
      type: "human",
      pick: null,
      vote: null,
    }];
    if (clearLogs) this.logs = [];
    if (!this.logs.length) this.addLog("로비 준비 완료. AI를 추가하거나 친구를 초대하세요.", true);
  }

  startElection(message) {
    this.clearCandidateBlockTimer();
    this.phase = "voting";
    this.players.forEach((player) => {
      player.vote = null;
      player.pick = null;
    });
    this.lastResult = null;
    this.lastPlayerPick = null;
    this.addLog(message, true);
    this.scheduleAutomation();
  }

  prepareFirstElection() {
    this.assignRevolutionary();
    this.assignMaestro();
    this.assignShaman();
    this.assignCupid();
    this.assignSheriff();
    this.assignClown();
    this.assignCourtRoles();
    if (this.beginCourtDefendantSelection(() => {
      if (this.beginCupidSelectionIfNeeded(() => this.continueAfterCupidSetup())) return;
      this.continueAfterCupidSetup();
    })) return;
    if (this.beginCupidSelectionIfNeeded(() => this.continueAfterCupidSetup())) return;
    this.continueAfterCupidSetup();
  }

  continueAfterCupidSetup() {
    const revolutionary = this.playerById(this.revolutionaryId);
    if (revolutionary?.isHuman && revolutionary.alive) {
      this.phase = "candidateBlock";
      this.pendingRevolutionTargetId = null;
      this.candidateBlockSecondsLeft = 10;
      this.addLog("혁명가의 첫 시장 후보 제외가 시작되었습니다.", true);
      this.startCandidateBlockTimer();
      return;
    }

    this.applyCandidateBlock(this.randomCandidateBlockTargetId(), true);
    this.startElection("게임 시작 전 시장 투표가 시작되었습니다.");
  }

  assignRevolutionary() {
    if (this.revolutionaryAssigned) return;
    const candidates = this.alivePlayers();
    const revolutionary = candidates[Math.floor(Math.random() * candidates.length)];
    this.revolutionaryId = revolutionary?.id ?? null;
    this.revolutionaryAssigned = true;
  }

  assignMaestro() {
    if (this.maestroAssigned) return;
    const candidates = this.alivePlayers().filter((player) => player.id !== this.revolutionaryId);
    const maestro = candidates[Math.floor(Math.random() * candidates.length)];
    this.maestroId = maestro?.id ?? null;
    this.maestroAssigned = true;
  }

  assignShaman() {
    if (this.shamanAssigned) return;
    const excluded = new Set([this.revolutionaryId, this.maestroId]);
    const candidates = this.alivePlayers().filter((player) => !excluded.has(player.id));
    const shaman = candidates[Math.floor(Math.random() * candidates.length)];
    this.shamanId = shaman?.id ?? null;
    this.shamanAssigned = true;
  }

  assignCupid() {
    if (this.cupidAssigned) return;
    const excluded = this.secretJobHolderIds();
    const candidates = this.alivePlayers().filter((player) => !excluded.has(player.id));
    const cupid = candidates[Math.floor(Math.random() * candidates.length)];
    this.cupidId = cupid?.id ?? null;
    this.cupidAssigned = true;
  }

  assignSheriff() {
    if (this.sheriffAssigned) return;
    const excluded = this.secretJobHolderIds();
    const candidates = this.alivePlayers().filter((player) => !excluded.has(player.id));
    const sheriff = candidates[Math.floor(Math.random() * candidates.length)];
    this.sheriffId = sheriff?.id ?? null;
    this.sheriffAssigned = true;
  }

  assignClown() {
    if (this.clownAssigned) return;
    const excluded = this.secretJobHolderIds();
    const candidates = this.alivePlayers().filter((player) => !excluded.has(player.id));
    const clown = candidates[Math.floor(Math.random() * candidates.length)];
    this.clownId = clown?.id ?? null;
    this.clownAssigned = true;
  }

  assignCourtRoles() {
    if (this.courtAssigned) return;
    const candidates = this.shuffle(this.alivePlayers().filter((player) => !this.secretJobHolderIds().has(player.id)));
    this.judgeId = candidates[0]?.id ?? null;
    this.prosecutorId = candidates[1]?.id ?? null;
    this.defenderId = candidates[2]?.id ?? null;
    this.courtAssigned = true;
    this.courtActive = [this.judgeId, this.prosecutorId, this.defenderId].every((id) => id !== null && id !== undefined);
  }

  courtRoleIds() {
    return [this.judgeId, this.prosecutorId, this.defenderId].filter((id) => id !== null && id !== undefined);
  }

  isCourtRole(player) {
    return this.courtRoleIds().includes(player?.id);
  }

  courtDefendantCandidates() {
    const excluded = new Set([...this.courtRoleIds(), ...this.acquittedIds]);
    return this.alivePlayers().filter((player) => !excluded.has(player.id));
  }

  courtSystemAlive() {
    return this.courtActive && this.courtRoleIds().every((id) => this.playerById(id)?.alive);
  }

  beginCourtDefendantSelection(afterSelection = null) {
    if (!this.courtSystemAlive() || this.defendantId !== null) return false;
    const candidates = this.courtDefendantCandidates();
    if (!candidates.length) {
      this.endCourtSystem();
      return false;
    }

    const judge = this.playerById(this.judgeId);
    if (!judge?.isHuman) {
      this.setCourtDefendant(this.shuffle(candidates)[0].id);
      if (afterSelection) afterSelection();
      return true;
    }

    this.phase = "courtSelect";
    this.pendingCourtDefendantId = null;
    this.courtSecondsLeft = 10;
    this.courtAfterSelection = afterSelection;
    this.startCourtTimer();
    this.render();
    return true;
  }

  startCourtTimer() {
    this.clearCourtTimer();
    this.courtTimer = window.setInterval(() => {
      this.courtSecondsLeft -= 1;
      if (this.courtSecondsLeft <= 0) {
        const candidate = this.shuffle(this.courtDefendantCandidates())[0];
        if (candidate) this.setCourtDefendant(candidate.id);
        const after = this.courtAfterSelection;
        this.courtAfterSelection = null;
        if (after) after();
      }
      this.render();
    }, 1000);
  }

  clearCourtTimer() {
    if (!this.courtTimer) return;
    window.clearInterval(this.courtTimer);
    this.courtTimer = null;
  }

  selectCourtDefendant(targetId) {
    if (this.phase !== "courtSelect") return;
    const target = this.playerById(targetId);
    if (!target?.alive || !this.courtDefendantCandidates().some((player) => player.id === target.id)) return;
    this.pendingCourtDefendantId = target.id;
    this.render();
  }

  confirmCourtDefendant() {
    if (this.phase !== "courtSelect" || !this.pendingCourtDefendantId) return;
    this.setCourtDefendant(this.pendingCourtDefendantId);
    const after = this.courtAfterSelection;
    this.courtAfterSelection = null;
    if (after) after();
    else this.phase = "choosing";
    this.render();
  }

  setCourtDefendant(targetId) {
    const target = this.playerById(targetId);
    if (!target?.alive) return false;
    this.clearCourtTimer();
    this.defendantId = target.id;
    this.pendingCourtDefendantId = null;
    this.addLog(`${target.name}님이 피고로 지목되었습니다.`, true);
    return true;
  }

  endCourtSystem() {
    if (!this.courtActive) return;
    this.courtActive = false;
    this.defendantId = null;
    this.prosecutorPick = null;
    this.defenderPick = null;
    this.clearCourtTimer();
    this.addLog("법정이 붕괴되었습니다.", true);
  }

  applyCourtVerdict(result) {
    this.guiltyIds = [];
    this.innocentIds = [];
    if (!this.courtSystemAlive() || !this.defendantId) return;
    const defendant = this.playerById(this.defendantId);
    if (!defendant?.alive) return;
    this.ensureCourtPicks();
    this.applyCourtDefendantPick();
    if (this.prosecutorPick === this.defenderPick) {
      if (!result.eliminatedIds.includes(defendant.id)) result.eliminatedIds.push(defendant.id);
      this.prosecutorSuccesses += 1;
      this.defenderFailures += 1;
      this.guiltyIds.push(defendant.id);
      this.addLog("검사의 기소가 성공했습니다.", true);
    } else {
      this.addLog("변호인의 변론이 성공했습니다.", true);
    }
  }

  finalizeCourtAfterRound() {
    if (!this.courtActive) return false;
    if (!this.courtSystemAlive()) {
      this.endCourtSystem();
      return false;
    }
    const defendant = this.playerById(this.defendantId);
    if (!defendant) return false;

    if (!defendant.alive) {
      const alreadyCountedGuilty = this.guiltyIds.includes(defendant.id);
      if (!alreadyCountedGuilty) this.defenderFailures += 1;
      this.guiltyIds = [...new Set([...this.guiltyIds, defendant.id])];
      this.addLog(`피고 ${defendant.name}님은 유죄 판결을 받고 탈락했습니다.`, true);
    } else {
      this.defenderSuccesses += 1;
      this.innocentIds = [defendant.id];
      this.acquittedIds = [...new Set([...this.acquittedIds, defendant.id])];
      this.addLog(`피고 ${defendant.name}님은 무죄 판결을 받았습니다.`, true);
      this.addLog(`${defendant.name}님은 다시 피고로 지정될 수 없습니다.`, true);
    }

    this.defendantId = null;
    this.prosecutorPick = null;
    this.defenderPick = null;

    if (this.defenderFailures >= 3) {
      const defender = this.playerById(this.defenderId);
      this.addLog("변호사가 피고를 지키지 못해 탈락했습니다.", true);
      this.applyImmediateEliminations([defender?.id], false);
      this.endCourtSystem();
      return true;
    }

    if (this.defenderSuccesses >= 3) {
      this.addLog("변호사가 각성하여 판사와 검사를 무너뜨렸습니다.", true);
      this.applyImmediateEliminations([this.judgeId, this.prosecutorId], false);
      this.endCourtSystem();
      return true;
    }

    if (this.prosecutorSuccesses >= 3) {
      this.addLog("검사가 세 번의 기소에 성공했습니다.", true);
      this.addLog("최종 판결전이 시작됩니다.", true);
      this.resolveFinalCourtDuel();
      return true;
    }

    return false;
  }

  resolveFinalCourtDuel() {
    const judge = this.playerById(this.judgeId);
    const prosecutor = this.playerById(this.prosecutorId);
    if (!judge?.alive || !prosecutor?.alive) {
      this.endCourtSystem();
      return;
    }
    let judgePick = null;
    let prosecutorPick = null;
    for (let i = 0; i < 8; i += 1) {
      judgePick = this.randomChoice();
      prosecutorPick = this.randomChoice();
      if (judgePick !== prosecutorPick) break;
    }
    if (judgePick === prosecutorPick || CHOICES[judgePick].beats === prosecutorPick) {
      this.addLog("판사가 최종 판결전에서 승리했습니다. 검사가 탈락했습니다.", true);
      this.applyImmediateEliminations([prosecutor.id], false);
    } else {
      this.addLog("검사가 최종 판결전에서 승리했습니다. 판사가 탈락했습니다.", true);
      this.applyImmediateEliminations([judge.id], false);
    }
    this.endCourtSystem();
  }

  secretJobHolderIds() {
    return new Set([
      this.revolutionaryId,
      this.maestroId,
      this.shamanId,
      this.cupidId,
      this.sheriffId,
      this.clownId,
      this.judgeId,
      this.prosecutorId,
      this.defenderId,
      ...this.assassinIds,
    ].filter((id) => id !== null && id !== undefined));
  }

  cupidCandidates() {
    const loverSet = new Set(this.cupidLoverIds);
    return this.alivePlayers().filter((player) => player.id !== this.cupidId && !loverSet.has(player.id));
  }

  beginCupidSelectionIfNeeded(afterSelection = null) {
    const cupid = this.playerById(this.cupidId);
    if (!cupid?.alive || this.cupidLoverIds.some((id) => this.playerById(id)?.alive)) return false;
    if (this.round < this.cupidNextSelectionRound) return false;
    const candidates = this.cupidCandidates();
    if (candidates.length < 2) return false;
    this.pendingCupidIds = [];
    this.cupidSecondsLeft = 15;
    this.cupidAfterSelection = afterSelection;
    if (!cupid.isHuman) {
      this.assignCupidLovers(this.shuffle(candidates).slice(0, 2).map((player) => player.id));
      this.cupidAfterSelection = null;
      if (afterSelection) afterSelection();
      return true;
    }
    this.phase = "cupidSelect";
    this.startCupidTimer();
    this.render();
    return true;
  }

  startCupidTimer() {
    this.clearCupidTimer();
    this.cupidTimer = window.setInterval(() => {
      this.cupidSecondsLeft -= 1;
      if (this.cupidSecondsLeft <= 0) {
        const ids = this.shuffle(this.cupidCandidates()).slice(0, 2).map((player) => player.id);
        this.assignCupidLovers(ids);
        const after = this.cupidAfterSelection;
        this.cupidAfterSelection = null;
        if (after) after();
      }
      this.render();
    }, 1000);
  }

  clearCupidTimer() {
    if (!this.cupidTimer) return;
    window.clearInterval(this.cupidTimer);
    this.cupidTimer = null;
  }

  toggleCupidTarget(playerId) {
    if (this.phase !== "cupidSelect") return;
    const selected = new Set(this.pendingCupidIds);
    if (selected.has(playerId)) selected.delete(playerId);
    else if (selected.size < 2) selected.add(playerId);
    this.pendingCupidIds = [...selected];
    this.render();
  }

  confirmCupidSelection() {
    if (this.phase !== "cupidSelect" || this.pendingCupidIds.length < 2) return;
    this.assignCupidLovers(this.pendingCupidIds);
    const after = this.cupidAfterSelection;
    this.cupidAfterSelection = null;
    if (after) after();
    else this.phase = "choosing";
    this.render();
  }

  assignCupidLovers(ids) {
    if (ids.length < 2) return;
    this.clearCupidTimer();
    this.cupidLoverIds = ids.slice(0, 2);
    this.pendingCupidIds = [];
    this.loverSurvivalRounds = 0;
    this.addLog("누군가의 사랑이 시작되었습니다.", true);
  }

  cupidLovers() {
    return this.cupidLoverIds.map((id) => this.playerById(id)).filter(Boolean);
  }

  processCupidLoverDeaths() {
    const lovers = this.cupidLovers();
    if (lovers.length < 2) return false;

    const deadLovers = lovers.filter((player) => !player.alive);
    if (!deadLovers.length) return false;

    const cupid = this.playerById(this.cupidId);
    const cupidCanScore = Boolean(cupid?.alive);
    const diedIds = new Set(deadLovers.map((player) => player.id));
    const livingLovers = lovers.filter((player) => player.alive);

    livingLovers.forEach((player) => {
      player.alive = false;
      diedIds.add(player.id);
    });

    this.loveDeathIds = [...new Set([...this.loveDeathIds, ...diedIds])];
    this.addLog(`${lovers[0].name}님과 ${lovers[1].name}님이 사랑에 빠져 심장 마비로 사망했습니다.`, true);
    if (livingLovers.length) this.playEliminationSound();

    if (cupidCanScore) {
      this.cupidLoveDeaths += diedIds.size;
    }

    this.cupidLoverIds = [];
    this.loverSurvivalRounds = 0;
    this.cupidNextSelectionRound = this.round + 1;
    this.successorIds = this.successorIds.filter((id) => this.playerById(id)?.alive);

    if (diedIds.has(this.mayorId) && !this.mayorSystemGone) {
      this.resolveSuccessionAfterMayorDeath();
    } else if (this.successionDuel) {
      this.successionDuel.ids = this.successionDuel.ids.filter((id) => this.playerById(id)?.alive);
      if (this.successionDuel.ids.length < 2) this.resolveSuccessionAfterMayorDeath();
    }

    if (cupidCanScore && this.cupidLoveDeaths >= 4) {
      this.phase = "over";
      this.addLog("큐피트가 네 명의 사랑을 끝내고 승리했습니다.", true);
      this.showSpecialVictory("큐피트 승리", `${cupid.name}님이 네 명의 사랑을 끝냈습니다.`);
      this.render();
      return true;
    }

    if (cupidCanScore && this.cupidCandidates().length >= 2) {
      this.addLog("새로운 사랑이 시작될 준비를 합니다.", true);
    }

    return false;
  }

  advanceLoverSurvivalRound() {
    const lovers = this.cupidLovers();
    if (lovers.length < 2 || lovers.some((player) => !player.alive)) return false;

    this.loverSurvivalRounds += 1;
    if (this.loverSurvivalRounds < 4) return false;

    this.phase = "over";
    this.addLog("두 애인이 끝까지 살아남아 승리했습니다.", true);
    this.showSpecialVictory(
      "애인 승리",
      `${lovers[0].name}님과 ${lovers[1].name}님이 4라운드 동안 함께 살아남았습니다.`,
    );
    this.render();
    return true;
  }

  evaluateClownPrediction() {
    const clown = this.playerById(this.clownId);
    if (!clown?.alive || this.clownIsJoker || this.clownPrediction?.round !== this.round) return false;

    const entries = Object.entries(this.clownPrediction.predictions);
    if (!entries.length) return false;

    const correctCount = entries.reduce((count, [id, expectedAlive]) => {
      const player = this.playerById(Number(id));
      return count + (Boolean(player?.alive) === expectedAlive ? 1 : 0);
    }, 0);

    if (correctCount === entries.length) {
      this.phase = "over";
      this.addLog("삐에로가 모든 운명을 맞히고 승리했습니다.", true);
      this.showSpecialVictory("삐에로 승리", `${clown.name}님 승리 · 모든 운명이 무대 위에서 밝혀졌습니다.`);
      this.render();
      return true;
    }

    const jokerThreshold = Math.ceil(entries.length / 2);
    if (correctCount >= jokerThreshold) {
      this.clownIsJoker = true;
      this.clownPrediction = null;
      this.pendingClownPrediction = {};
      this.addLog("누군가가 운명의 흐름을 읽었습니다.", true);
      if (clown.isHuman) this.addLog("당신은 조커로 변신했습니다.", true);
      return false;
    }

    this.clownFailures += 1;
    this.addLog("누군가의 예측이 빗나갔습니다.", true);
    this.clownPrediction = null;
    this.pendingClownPrediction = {};

    if (this.clownFailures >= 3) {
      this.addLog("삐에로의 무대가 막을 내렸습니다.", true);
      this.applyImmediateEliminations([clown.id], false);
    }

    return this.phase === "over";
  }

  randomCandidateBlockTargetId() {
    const targets = this.alivePlayers().filter((player) => player.id !== this.revolutionaryId);
    return targets[Math.floor(Math.random() * targets.length)]?.id ?? null;
  }

  applyCandidateBlock(targetId, random = false) {
    const target = this.playerById(targetId);
    if (!target?.alive || target.id === this.revolutionaryId) return false;
    this.clearCandidateBlockTimer();
    this.candidateBlockTargetId = target.id;
    this.candidateBlockApplied = true;
    if (random) this.addLog("제한 시간이 지나 후보 제외 대상이 무작위로 정해졌습니다.");
    this.addLog(`${target.name}님은 첫 시장 후보에서 제외되었습니다.`, true);
    return true;
  }

  startCandidateBlockTimer() {
    this.clearCandidateBlockTimer();
    this.candidateBlockTimer = window.setInterval(() => {
      this.candidateBlockSecondsLeft -= 1;
      if (this.candidateBlockSecondsLeft <= 0) {
        this.applyCandidateBlock(this.randomCandidateBlockTargetId(), true);
        this.startElection("게임 시작 전 시장 투표가 시작되었습니다.");
      }
      this.render();
    }, 1000);
  }

  clearCandidateBlockTimer() {
    if (!this.candidateBlockTimer) return;
    window.clearInterval(this.candidateBlockTimer);
    this.candidateBlockTimer = null;
  }

  castHumanVote(candidateId) {
    const human = this.human();
    if (this.phase !== "voting" || !human.alive || human.id === candidateId) return;

    const voters = this.alivePlayers();
    const candidates = this.mayorCandidates();
    const votes = voters.map((player) => ({
      voterId: player.id,
      candidateId: player.isHuman ? candidateId : this.randomCandidateId(player.id, candidates),
    }));

    this.applyMayorElection(votes);
  }

  applyMayorElection(votes) {
    const voters = this.alivePlayers();
    const candidates = this.mayorCandidates();
    const election = selectMayorFromVotes({
      votes,
      candidates,
      voters,
      ineligibleCandidateIds: this.revolutionaryMayorIneligibleIds(),
    });
    this.mayorId = election.mayorId;
    this.successionDuel = null;
    this.players.forEach((player) => {
      const vote = votes.find((item) => item.voterId === player.id);
      player.vote = vote?.candidateId ?? null;
    });

    const mayor = this.playerById(this.mayorId);
    this.addLog(`새 시장은 ${mayor.name}입니다.`, true);
    this.addLog(`시장 투표 결과: ${this.formatVoteTally(election.tally)}`);
    this.beginSuccessorAssignment();
    this.render();
  }

  mayorCandidates() {
    const alive = this.alivePlayers();
    if (this.candidateBlockApplied && this.mayorId === null && this.round === 1) {
      return alive.filter((player) => player.id !== this.candidateBlockTargetId);
    }
    return alive;
  }

  revolutionaryMayorIneligibleIds() {
    const revolutionary = this.playerById(this.revolutionaryId);
    return revolutionary?.alive && !this.revolutionPowerUsed ? [revolutionary.id] : [];
  }

  choose(choice) {
    if (this.phase !== "choosing" || !this.human().alive) return;
    this.assignRoundPicks(choice);
    this.prepareRoundResolution();
  }

  assignRoundPicks(humanChoice = null) {
    this.players.forEach((player) => {
      if (!player.alive) return;
      if (player.isHuman) {
        player.pick = this.canSkipRps(player) ? null : humanChoice;
      } else if (this.canSkipRps(player)) {
        player.pick = null;
      } else {
        player.pick = this.randomChoice();
      }
    });
    this.ensureCourtPicks();
    this.applyCourtDefendantPick();
  }

  canSkipRps(player) {
    return player?.alive && (
      player.id === this.clownId
      || (this.courtSystemAlive() && this.isCourtRole(player))
    );
  }

  ensureCourtPicks() {
    if (!this.courtSystemAlive() || !this.defendantId) return;
    const prosecutor = this.playerById(this.prosecutorId);
    const defender = this.playerById(this.defenderId);
    if (!this.prosecutorPick || !prosecutor?.isHuman) this.prosecutorPick = this.prosecutorPick || this.randomChoice();
    if (!this.defenderPick || !defender?.isHuman) this.defenderPick = this.defenderPick || this.randomChoice();
  }

  applyCourtDefendantPick() {
    if (!this.courtSystemAlive() || !this.defendantId) return false;
    const defendant = this.playerById(this.defendantId);
    if (!defendant?.alive || !this.defenderPick) return false;
    defendant.pick = this.defenderPick;
    return true;
  }

  submitClownRoundWithoutPick() {
    const human = this.human();
    if (this.phase !== "choosing" || !human.alive || !this.canSkipRps(human)) return;
    this.assignRoundPicks(null);
    this.prepareRoundResolution();
  }

  clownPredictionTargets() {
    const clown = this.playerById(this.clownId);
    return this.alivePlayers().filter((player) => player.id !== clown?.id);
  }

  setClownPrediction(targetId, expectedAlive) {
    const human = this.human();
    if (this.phase !== "choosing" || human.id !== this.clownId || this.clownIsJoker) return;
    if (this.clownPredictionRound === this.round) return;
    const target = this.playerById(targetId);
    if (!target?.alive || target.id === human.id) return;
    this.pendingClownPrediction = {
      ...this.pendingClownPrediction,
      [target.id]: expectedAlive,
    };
    this.render();
  }

  confirmClownPrediction() {
    const human = this.human();
    if (this.phase !== "choosing" || human.id !== this.clownId || this.clownIsJoker) return;
    if (this.clownPredictionRound === this.round) return;
    const targets = this.clownPredictionTargets();
    const hasAllPredictions = targets.every((target) => typeof this.pendingClownPrediction[target.id] === "boolean");
    if (!hasAllPredictions || !targets.length) return;
    this.clownPrediction = {
      round: this.round,
      predictions: Object.fromEntries(targets.map((target) => [target.id, this.pendingClownPrediction[target.id]])),
    };
    this.clownPredictionRound = this.round;
    this.addLog("누군가가 운명을 예측했습니다.", true);
    this.render();
  }

  ensureAiClownPrediction() {
    const clown = this.playerById(this.clownId);
    if (!clown?.alive || clown.isHuman || this.clownIsJoker || this.clownPredictionRound === this.round) return;
    const targets = this.clownPredictionTargets();
    if (!targets.length) return;
    const predictions = {};
    targets.forEach((target) => {
      predictions[target.id] = Math.random() > 0.35;
    });
    this.clownPrediction = { round: this.round, predictions };
    this.clownPredictionRound = this.round;
    this.addLog("누군가가 운명을 예측했습니다.", true);
  }

  prepareRoundResolution() {
    this.runAiPreRoundAbilities();
    if (this.phase !== "choosing") return;
    this.ensureAiMaestroTarget();
    if (this.shouldStartHypnosisResistance()) {
      this.startHypnosisResistance();
      return;
    }

    this.applyMaestroHypnosis();
    this.ensureCourtPicks();
    this.applyCourtDefendantPick();
    this.resolveRound();
  }

  runAiPreRoundAbilities() {
    if (this.phase !== "choosing") return;
    this.ensureAiClownPrediction();

    const revolutionary = this.playerById(this.revolutionaryId);
    if (revolutionary?.alive && !revolutionary.isHuman && this.canUseRevolutionPower(revolutionary) && this.mayorId !== null) {
      this.useRevolution(revolutionary, this.mayorId, false);
      if (this.phase !== "choosing") return;
    }

    const anonymousMayor = this.playerById(this.anonymousMayorId);
    if (anonymousMayor?.alive && !anonymousMayor.isHuman && this.canUseDivineGrace(anonymousMayor)) {
      const targets = this.alivePlayers().filter((player) => player.id !== anonymousMayor.id);
      const target = targets[Math.floor(Math.random() * targets.length)];
      if (target) this.useDivineGrace(anonymousMayor, target.id, false);
      if (this.phase !== "choosing") return;
    }

    const sheriff = this.playerById(this.sheriffId);
    if (sheriff?.alive && !sheriff.isHuman && this.canUseSheriffPower(sheriff)) {
      const targets = this.alivePlayers().filter((player) => player.id !== sheriff.id);
      const dangerousTargets = targets.filter((player) => this.getRoleAlignment(player) === "danger");
      const pool = dangerousTargets.length ? dangerousTargets : targets;
      const target = pool[Math.floor(Math.random() * pool.length)];
      if (target) this.useSheriffJustice(sheriff, target.id, false);
      if (this.phase !== "choosing") return;
    }

    this.assassinIds
      .map((id) => this.playerById(id))
      .filter((assassin) => assassin?.alive && !assassin.isHuman && this.canUseAssassinPower(assassin))
      .forEach((assassin) => {
        if (this.phase !== "choosing") return;
        const targets = this.alivePlayers().filter((player) => player.id !== assassin.id);
        const target = targets[Math.floor(Math.random() * targets.length)];
        const roles = this.assassinationRoles();
        const guessedRole = roles[Math.floor(Math.random() * roles.length)]?.key;
        if (target && guessedRole) this.useAssassination(assassin, target.id, guessedRole, false);
      });
  }

  ensureAiMaestroTarget() {
    const maestro = this.playerById(this.maestroId);
    if (!maestro?.alive || maestro.isHuman || this.phase !== "choosing") return;
    const targets = this.alivePlayers().filter((player) => player.id !== maestro.id);
    this.maestroTargetId = targets[Math.floor(Math.random() * targets.length)]?.id ?? null;
  }

  shouldStartHypnosisResistance() {
    const alive = this.alivePlayers();
    const maestro = this.playerById(this.maestroId);
    const target = this.playerById(this.maestroTargetId);
    return alive.length === 2
      && maestro?.alive
      && target?.alive
      && target.id !== maestro.id
      && alive.some((player) => player.id === maestro.id)
      && alive.some((player) => player.id === target.id);
  }

  applyMaestroHypnosis() {
    this.lastHypnosisApplied = false;
    const maestro = this.playerById(this.maestroId);
    const target = this.playerById(this.maestroTargetId);
    if (!maestro?.alive || !target?.alive || target.id === maestro.id || !maestro.pick) return false;
    target.pick = CHOICES[maestro.pick].beats;
    this.lastHypnosisApplied = true;
    this.addLog("누군가의 선택이 최면 지휘로 바뀌었습니다.", true);
    return true;
  }

  startHypnosisResistance() {
    const maestro = this.playerById(this.maestroId);
    const target = this.playerById(this.maestroTargetId);
    if (!maestro?.alive || !target?.alive) {
      this.applyMaestroHypnosis();
      this.resolveRound();
      return;
    }

    this.phase = "resistance";
    this.resistance = {
      maestroId: maestro.id,
      targetId: target.id,
      secondsLeft: 5,
      maestroTaps: 0,
      targetTaps: 0,
    };
    this.addLog("최면 저항전이 시작되었습니다.", true);
    this.openResistanceModal();
    this.startResistanceTimer();
    this.render();
  }

  openResistanceModal() {
    if (!this.resistance) return;
    const human = this.human();
    this.resistanceModal.hidden = false;
    this.resistanceTitle.textContent = "최면 저항전!";
    if (human.id === this.resistance.maestroId) {
      this.resistanceText.textContent = "최면을 완성하라!";
    } else if (human.id === this.resistance.targetId) {
      this.resistanceText.textContent = "최면에 저항하라!";
    } else {
      this.resistanceText.textContent = "최면 저항전이 시작되었습니다.";
    }
    this.renderResistanceModal();
  }

  renderResistanceModal() {
    if (!this.resistance) return;
    this.resistanceTimerValue.textContent = this.resistance.secondsLeft;
    this.maestroTapCount.textContent = this.resistance.maestroTaps;
    this.targetTapCount.textContent = this.resistance.targetTaps;
  }

  startResistanceTimer() {
    this.clearResistanceTimer();
    this.resistanceTimer = window.setInterval(() => {
      if (!this.resistance) return;
      const maestro = this.playerById(this.resistance.maestroId);
      const target = this.playerById(this.resistance.targetId);
      if (!maestro?.isHuman) this.resistance.maestroTaps += 1 + Math.floor(Math.random() * 4);
      if (!target?.isHuman) this.resistance.targetTaps += 1 + Math.floor(Math.random() * 4);
      this.resistance.secondsLeft -= 1;
      this.renderResistanceModal();
      if (this.resistance.secondsLeft <= 0) this.finishHypnosisResistance();
    }, 1000);
  }

  clearResistanceTimer() {
    if (!this.resistanceTimer) return;
    window.clearInterval(this.resistanceTimer);
    this.resistanceTimer = null;
  }

  registerResistanceTap() {
    if (this.phase !== "resistance" || !this.resistance) return;
    const humanId = this.human().id;
    if (humanId === this.resistance.maestroId) {
      this.resistance.maestroTaps += 1;
    } else if (humanId === this.resistance.targetId) {
      this.resistance.targetTaps += 1;
    }
    this.renderResistanceModal();
  }

  finishHypnosisResistance() {
    if (!this.resistance) return;
    this.clearResistanceTimer();
    const resistance = this.resistance;
    const maestro = this.playerById(resistance.maestroId);
    const target = this.playerById(resistance.targetId);
    const maestroWon = resistance.maestroTaps > resistance.targetTaps;
    this.resistance = null;

    if (maestroWon && maestro?.alive && target?.alive && maestro.pick) {
      target.pick = CHOICES[maestro.pick].beats;
      this.resistanceTitle.textContent = "최면 지휘가 성공했습니다.";
      this.resistanceText.textContent = "누군가의 선택이 바뀌었습니다.";
      this.addLog("누군가의 선택이 최면 지휘로 바뀌었습니다.", true);
      window.setTimeout(() => {
        this.resistanceModal.hidden = true;
        this.resolveRound();
      }, 800);
      return;
    }

    if (maestro?.alive && target?.alive && target.pick) {
      maestro.pick = CHOICES[target.pick].beats;
    }
    this.resistanceTitle.textContent = "너의 승리다..";
    this.resistanceText.textContent = "최면이 역류했습니다.";
    this.addLog("최면이 역류했습니다.", true);
    this.addLog("누군가가 패배를 인정했습니다.", true);
    window.setTimeout(() => {
      this.resistanceModal.hidden = true;
      if (maestro?.alive) {
        maestro.alive = false;
        this.playEliminationSound();
        this.addLog("최면 역류로 마에스트로가 탈락했습니다.", true);
      }
      this.checkVictoryAfterElimination();
      if (this.phase !== "over") {
        this.phase = "choosing";
        this.players.forEach((player) => {
          player.pick = null;
        });
        this.lastPlayerPick = null;
        this.maestroTargetId = null;
      }
      this.render();
    }, 1500);
  }

  resolveRound() {
    this.phase = "reveal";
    const protectedIds = this.successionDuel?.ids || [];
    const result = resolveMajorityRound({
      players: this.players,
      mayorId: this.mayorSystemGone ? null : this.mayorId,
      protectedIds,
      anonymousMayorId: this.anonymousMayorId,
    });
    this.lastResult = result;
    this.lastPlayerPick = this.human().pick;
    const anonymousMayorWasEliminated = result.eliminatedIds.includes(this.anonymousMayorId);
    if (anonymousMayorWasEliminated) {
      result.eliminatedIds = result.eliminatedIds.filter((id) => id !== this.anonymousMayorId);
    }
    this.applyCourtVerdict(result);

    if (this.maybeStartFateExchange(result, anonymousMayorWasEliminated)) return;
    this.finishRoundResult(result, anonymousMayorWasEliminated);
  }

  finishRoundResult(result, anonymousMayorWasEliminated = false) {
    this.phase = "reveal";
    result.eliminatedIds.forEach((id) => {
      const player = this.playerById(id);
      if (player) player.alive = false;
    });
    if (result.eliminatedIds.length) this.playEliminationSound();

    this.addRoundLogs(result);
    this.successorIds = this.successorIds.filter((id) => this.playerById(id)?.alive);
    if (this.successionDuel) {
      this.resolveSuccessionDuel(result);
    }
    if (this.processCupidLoverDeaths()) return;
    if (this.evaluateClownPrediction()) return;
    if (this.finalizeCourtAfterRound()) return;

    const mayorWasEliminated = this.mayorId !== null
      && (result.eliminatedIds.includes(this.mayorId) || !this.playerById(this.mayorId)?.alive);
    if (anonymousMayorWasEliminated && this.anonymousMayorId !== null) {
      this.startFinalEdict();
      this.render();
      return;
    }
    const survivors = this.alivePlayers();

    if (survivors.length <= 1) {
      this.phase = "over";
      if (survivors.length === 1) {
        this.addLog(`${survivors[0].name} 최종 생존. 승리!`, true);
        this.showVictory(survivors[0]);
      } else {
        this.addLog("모두 동시에 탈락했습니다. 생존자가 없습니다.", true);
        this.showVictory(null);
      }
      this.render();
      return;
    }

    if (this.advanceLoverSurvivalRound()) return;

    this.round += 1;

    window.setTimeout(() => {
      if (this.phase !== "reveal") return;
      this.players.forEach((player) => {
        player.pick = null;
      });
      this.lastPlayerPick = null;
      this.maestroTargetId = null;
      this.lastHypnosisApplied = false;
      this.pendingClownPrediction = {};

      if (mayorWasEliminated && !this.mayorSystemGone) {
        this.resolveSuccessionAfterMayorDeath();
        if (this.phase !== "successorSelect" && this.phase !== "choosing") {
          this.phase = "choosing";
        }
      } else {
        if (this.alivePlayers().length <= 2 && this.mayorId !== null && this.anonymousMayorId === null) {
          this.mayorId = null;
          this.addLog("마지막 2명만 남아 시장 권한이 비활성화됩니다.", true);
        }
        this.phase = "choosing";
      }
      if (this.phase === "choosing" && this.beginCupidSelectionIfNeeded(() => {
        this.phase = "choosing";
        this.render();
      })) {
        return;
      }
      if (this.phase === "choosing" && this.beginCourtDefendantSelection(() => {
        this.phase = "choosing";
        this.render();
      })) {
        return;
      }
      this.render();
    }, 1200);

    this.render();
  }

  maybeStartFateExchange(result, anonymousMayorWasEliminated) {
    const shaman = this.playerById(this.shamanId);
    if (!shaman?.alive || this.shamanSpent || !result.eliminatedIds.includes(shaman.id) || !result.baseChoice) {
      return false;
    }

    if (!shaman.isHuman) {
      this.applyAiFateExchange(result);
      if (this.deathSentenceReady && !this.shamanSpent && this.playerById(this.shamanId)?.alive) {
        this.startDeathSentence(result, anonymousMayorWasEliminated);
        return true;
      }
      return false;
    }

    this.phase = "fateSwap";
    this.pendingRoundResult = result;
    this.pendingAnonymousMayorEliminated = anonymousMayorWasEliminated;
    this.pendingFateTargetId = null;
    this.fateSecondsLeft = 10;
    this.startFateTimer();
    this.render();
    return true;
  }

  fateTargets() {
    return this.alivePlayers().filter((player) => player.id !== this.shamanId && player.pick);
  }

  selectFateTarget(targetId) {
    const target = this.playerById(targetId);
    if (this.phase !== "fateSwap" || !target?.alive || target.id === this.shamanId) return;
    this.pendingFateTargetId = target.id;
    this.render();
  }

  confirmShamanAction() {
    if (this.phase === "fateSwap") {
      this.applyFateExchange(this.pendingFateTargetId);
      return;
    }
    if (this.phase === "deathSentence") {
      this.useDeathSentence(this.pendingDeathTargetId);
    }
  }

  startFateTimer() {
    this.clearFateTimer();
    this.fateTimer = window.setInterval(() => {
      this.fateSecondsLeft -= 1;
      if (this.fateSecondsLeft <= 0) this.finishPendingRoundWithoutFate();
      this.render();
    }, 1000);
  }

  clearFateTimer() {
    if (!this.fateTimer) return;
    window.clearInterval(this.fateTimer);
    this.fateTimer = null;
  }

  finishPendingRoundWithoutFate() {
    this.clearFateTimer();
    const result = this.pendingRoundResult;
    const anonymousMayorWasEliminated = this.pendingAnonymousMayorEliminated;
    this.pendingRoundResult = null;
    this.pendingFateTargetId = null;
    this.finishRoundResult(result, anonymousMayorWasEliminated);
  }

  applyAiFateExchange(result) {
    const shaman = this.playerById(this.shamanId);
    const successTarget = this.fateTargets().find((target) => target.pick === CHOICES[shaman.pick]?.beats);
    const target = successTarget || this.fateTargets()[0];
    if (target) this.applyFateExchangeToResult(result, target.id);
  }

  applyFateExchange(targetId) {
    const result = this.pendingRoundResult;
    if (!result) return;
    this.clearFateTimer();
    this.applyFateExchangeToResult(result, targetId);
    const anonymousMayorWasEliminated = this.pendingAnonymousMayorEliminated;
    this.pendingRoundResult = null;
    this.pendingFateTargetId = null;

    if (this.deathSentenceReady && !this.shamanSpent && this.playerById(this.shamanId)?.alive) {
      this.startDeathSentence(result, anonymousMayorWasEliminated);
      return;
    }

    this.finishRoundResult(result, anonymousMayorWasEliminated);
  }

  applyFateExchangeToResult(result, targetId) {
    const shaman = this.playerById(this.shamanId);
    const target = this.playerById(targetId);
    if (!shaman?.alive || !target?.alive || target.id === shaman.id || !shaman.pick || !target.pick) return false;

    if (target.pick === CHOICES[shaman.pick].beats) {
      const shamanPick = shaman.pick;
      shaman.pick = target.pick;
      target.pick = shamanPick;
      this.shamanStreak += 1;
      this.addLog("누군가가 운명을 뒤바꿨습니다.", true);
      this.showCenterEffect("운명이 뒤바뀌었습니다.");
      result.eliminatedIds = this.recalculateEliminationsForBase(result);
      if (this.shamanStreak >= 2) this.deathSentenceReady = true;
      return true;
    }

    this.shamanStreak = 0;
    this.addLog("운명 교환이 실패하여 두 플레이어가 함께 탈락했습니다.", true);
    this.showCenterEffect("저주가 되돌아왔습니다.");
    result.eliminatedIds = [...new Set([...result.eliminatedIds, shaman.id, target.id])];
    return false;
  }

  recalculateEliminationsForBase(result) {
    if (!result.baseChoice) return [];
    const losingChoice = CHOICES[result.baseChoice].beats;
    const protectedSet = new Set(this.successionDuel?.ids || []);
    return this.alivePlayers()
      .filter((player) => player.pick === losingChoice && !protectedSet.has(player.id))
      .map((player) => player.id);
  }

  startDeathSentence(result, anonymousMayorWasEliminated) {
    const shaman = this.playerById(this.shamanId);
    if (!shaman?.isHuman) {
      const target = this.alivePlayers().find((player) => player.id !== this.shamanId && !result.eliminatedIds.includes(player.id));
      if (target) {
        this.runDeathSentence(target.id, () => this.finishRoundResult(result, anonymousMayorWasEliminated));
      } else {
        this.shamanSpent = true;
        this.finishRoundResult(result, anonymousMayorWasEliminated);
      }
      return;
    }

    this.phase = "deathSentence";
    this.pendingRoundResult = result;
    this.pendingAnonymousMayorEliminated = anonymousMayorWasEliminated;
    this.pendingDeathTargetId = null;
    this.deathSecondsLeft = 10;
    this.startDeathTimer();
    this.render();
  }

  startDeathTimer() {
    this.clearDeathTimer();
    this.deathTimer = window.setInterval(() => {
      this.deathSecondsLeft -= 1;
      if (this.deathSecondsLeft <= 0) this.expireDeathSentence();
      this.render();
    }, 1000);
  }

  clearDeathTimer() {
    if (!this.deathTimer) return;
    window.clearInterval(this.deathTimer);
    this.deathTimer = null;
  }

  expireDeathSentence() {
    this.clearDeathTimer();
    this.shamanSpent = true;
    this.deathSentenceReady = false;
    const result = this.pendingRoundResult;
    const anonymousMayorWasEliminated = this.pendingAnonymousMayorEliminated;
    this.pendingRoundResult = null;
    this.finishRoundResult(result, anonymousMayorWasEliminated);
  }

  selectDeathTarget(targetId) {
    const target = this.playerById(targetId);
    if (this.phase !== "deathSentence" || !target?.alive || target.id === this.shamanId) return;
    this.pendingDeathTargetId = target.id;
    this.render();
  }

  useDeathSentence(targetId) {
    const result = this.pendingRoundResult;
    const anonymousMayorWasEliminated = this.pendingAnonymousMayorEliminated;
    const target = this.playerById(targetId);
    if (!result || !target?.alive || target.id === this.shamanId) return;
    this.clearDeathTimer();
    this.pendingRoundResult = null;
    this.pendingDeathTargetId = null;
    this.runDeathSentence(target.id, () => this.finishRoundResult(result, anonymousMayorWasEliminated));
  }

  runDeathSentence(targetId, after) {
    const target = this.playerById(targetId);
    if (!target?.alive) return;
    this.shamanSpent = true;
    this.deathSentenceReady = false;
    this.addLog("누군가가 금지된 주술을 사용했습니다.", true);
    this.curseModal.hidden = false;
    this.curseTitle.textContent = "넌 이미 죽어있다.";
    this.curseText.textContent = "첫 번째 종소리";
    this.playBellSound();
    this.clearCurseTimer();
    let step = 1;
    this.curseTimer = window.setInterval(() => {
      step += 1;
      this.playBellSound();
      this.curseText.textContent = step === 2 ? "두 번째 종소리" : "붉은 저주가 새겨집니다.";
      if (step >= 3) {
        this.clearCurseTimer();
        target.alive = false;
        this.addLog(`사망 선고로 ${target.name}님이 탈락했습니다.`, true);
        this.curseModal.hidden = true;
        after();
      }
    }, 1000);
  }

  clearCurseTimer() {
    if (!this.curseTimer) return;
    window.clearInterval(this.curseTimer);
    this.curseTimer = null;
  }

  playBellSound() {
    this.bgm.playBell?.();
  }

  showCenterEffect(message) {
    this.resultBanner.textContent = message;
  }

  scheduleAutomation() {
    if (this.autoTimer || this.human().alive) return;
    if (this.phase !== "voting" && this.phase !== "choosing") return;

    this.autoTimer = window.setTimeout(() => {
      this.autoTimer = null;
      if (this.phase === "voting") {
        const voters = this.alivePlayers();
        const candidates = this.mayorCandidates();
        const votes = voters.map((player) => ({
          voterId: player.id,
          candidateId: this.randomCandidateId(player.id, candidates),
        }));
        this.applyMayorElection(votes);
        return;
      }

      if (this.phase === "choosing") {
        this.players.forEach((player) => {
          if (player.alive) player.pick = this.canSkipRps(player) ? null : this.randomChoice();
        });
        this.prepareRoundResolution();
      }
    }, 900);
  }

  clearAutoTimer() {
    if (!this.autoTimer) return;
    window.clearTimeout(this.autoTimer);
    this.autoTimer = null;
  }

  showPatchNotesOnce() {
    const seenVersion = localStorage.getItem("rps-survival-patch-version");
    if (seenVersion === PATCH_VERSION) return;
    this.openPatchNotes();
  }

  openPatchNotes() {
    this.patchModal.hidden = false;
  }

  closePatchNotes() {
    this.patchModal.hidden = true;
    localStorage.setItem("rps-survival-patch-version", PATCH_VERSION);
  }

  playEliminationSound() {
    this.bgm.playGunshot().catch(() => {});
  }

  showVictory(winner) {
    this.victoryTitle.textContent = winner ? "승리" : "무승부";
    this.victoryText.textContent = winner
      ? `${winner.name} 최후의 생존자`
      : "생존자가 없습니다.";
    this.victoryModal.hidden = false;
  }

  showSpecialVictory(title, text) {
    this.victoryTitle.textContent = title;
    this.victoryText.textContent = text;
    this.victoryModal.hidden = false;
  }

  assignSuccessors() {
    const mayor = this.playerById(this.mayorId);
    if (!mayor?.alive) {
      this.successorIds = [];
      return;
    }

    const candidates = this.alivePlayers().filter((player) => player.id !== mayor.id);
    this.successorIds = this.shuffle(candidates).slice(0, 2).map((player) => player.id);
    const count = this.successorIds.length;

    if (count > 0) {
      this.addLog(`시장이 비밀 후계자 ${count}명을 지정했습니다.`, true);
      if (this.successorIds.includes(this.human().id)) {
        this.addLog("당신은 비밀 후계자로 지정되었습니다.", true);
      }
      this.checkJokerSuccessorVictory();
    } else {
      this.addLog("지정할 수 있는 비밀 후계자가 없습니다.");
    }
  }

  beginSuccessorAssignment() {
    const mayor = this.playerById(this.mayorId);
    this.pendingSuccessorIds = [];

    if (mayor?.isHuman && mayor.alive) {
      this.phase = "successorSelect";
      this.addLog("당신은 시장입니다. 비밀 후계자를 직접 지정하세요.", true);
      return;
    }

    this.assignSuccessors();
    this.finishSuccessorAssignment();
  }

  finishSuccessorAssignment() {
    if (this.phase === "over") return;
    if (!this.assassinsAssigned) this.assignAssassins();
    this.phase = "choosing";
  }

  togglePendingSuccessor(candidateId) {
    if (this.phase !== "successorSelect") return;
    const candidates = this.successorCandidates();
    const targetCount = Math.min(2, candidates.length);
    const selected = new Set(this.pendingSuccessorIds);

    if (selected.has(candidateId)) {
      selected.delete(candidateId);
    } else if (selected.size < targetCount) {
      selected.add(candidateId);
    }

    this.pendingSuccessorIds = [...selected];
    this.render();
  }

  confirmHumanSuccessors() {
    if (this.phase !== "successorSelect") return;
    const candidates = this.successorCandidates();
    const targetCount = Math.min(2, candidates.length);
    if (this.pendingSuccessorIds.length < targetCount) {
      this.addLog(`후계자 ${targetCount}명을 선택해야 합니다.`);
      this.render();
      return;
    }

    this.successorIds = this.pendingSuccessorIds.slice(0, targetCount);
    this.pendingSuccessorIds = [];
    const count = this.successorIds.length;
    if (count > 0) this.addLog(`시장이 비밀 후계자 ${count}명을 지정했습니다.`, true);
    if (this.checkJokerSuccessorVictory()) {
      this.render();
      return;
    }
    this.finishSuccessorAssignment();
    this.render();
  }

  checkJokerSuccessorVictory() {
    const joker = this.playerById(this.clownId);
    if (!this.clownIsJoker || !joker?.alive || !this.successorIds.includes(joker.id)) return false;
    this.phase = "over";
    this.addLog("조커가 왕좌의 뒤편에 숨어들어 승리했습니다.", true);
    this.showSpecialVictory("조커 승리", `${joker.name}님이 왕좌의 뒤편에 숨어들었습니다.`);
    return true;
  }

  successorCandidates() {
    const mayor = this.playerById(this.mayorId);
    return this.alivePlayers().filter((player) => player.id !== mayor?.id);
  }

  assignAssassins() {
    const excludedIds = new Set([
      this.mayorId,
      this.revolutionaryId,
      this.maestroId,
      this.shamanId,
      this.cupidId,
      this.sheriffId,
      this.clownId,
      this.judgeId,
      this.prosecutorId,
      this.defenderId,
      ...this.successorIds,
    ]);
    const candidates = this.alivePlayers().filter((player) => !excludedIds.has(player.id));
    this.assassinIds = this.shuffle(candidates).slice(0, 2).map((player) => player.id);
    this.assassinsAssigned = true;
  }

  canUseAssassinPower(viewer = this.human()) {
    const roles = this.viewerRolePayload(viewer);
    return roles.isAssassin
      && this.phase === "choosing"
      && !this.assassinPowerUsedIds.includes(viewer.id)
      && this.alivePlayers().some((player) => player.id !== viewer.id);
  }

  assassinationRoles() {
    const roles = [
      { key: "assassin", label: "암살자" },
      { key: "civilian", label: "일반 플레이어" },
    ];

    if (this.hasRevolutionaryRole()) {
      roles.splice(1, 0, { key: "revolutionary", label: "혁명가" });
    }

    if (this.hasMaestroRole()) {
      roles.splice(1, 0, { key: "maestro", label: "마에스트로" });
    }

    if (this.hasShamanRole()) {
      roles.splice(1, 0, { key: "shaman", label: "주술사" });
    }

    if (this.hasCupidRole()) {
      roles.splice(1, 0, { key: "cupid", label: "큐피트" });
    }

    if (this.hasSheriffRole()) {
      roles.splice(1, 0, { key: "sheriff", label: "보안관" });
    }

    if (this.hasClownRole()) {
      roles.splice(1, 0, { key: this.clownIsJoker ? "joker" : "clown", label: this.clownIsJoker ? "조커" : "삐에로" });
    }

    if (this.hasCourtRole()) {
      roles.splice(1, 0, { key: "judge", label: "판사" });
      roles.splice(1, 0, { key: "prosecutor", label: "검사" });
      roles.splice(1, 0, { key: "defender", label: "변호사" });
    }

    return roles;
  }

  hasRevolutionaryRole() {
    return this.revolutionaryAssigned || this.players.some((player) => (
      player.role === "revolutionary"
      || player.job === "revolutionary"
      || player.roleKey === "revolutionary"
    ));
  }

  hasMaestroRole() {
    return this.maestroAssigned || this.players.some((player) => (
      player.role === "maestro"
      || player.job === "maestro"
      || player.roleKey === "maestro"
    ));
  }

  hasShamanRole() {
    return this.shamanAssigned || this.players.some((player) => (
      player.role === "shaman"
      || player.job === "shaman"
      || player.roleKey === "shaman"
    ));
  }

  hasCupidRole() {
    return this.cupidAssigned || this.players.some((player) => (
      player.role === "cupid"
      || player.job === "cupid"
      || player.roleKey === "cupid"
    ));
  }

  hasSheriffRole() {
    return this.sheriffAssigned || this.players.some((player) => (
      player.role === "sheriff"
      || player.job === "sheriff"
      || player.roleKey === "sheriff"
    ));
  }

  hasClownRole() {
    return this.clownAssigned || this.players.some((player) => (
      ["clown", "joker"].includes(player.role)
      || ["clown", "joker"].includes(player.job)
      || ["clown", "joker"].includes(player.roleKey)
    ));
  }

  hasCourtRole() {
    return this.courtAssigned || this.players.some((player) => (
      ["judge", "prosecutor", "defender"].includes(player.role)
      || ["judge", "prosecutor", "defender"].includes(player.job)
      || ["judge", "prosecutor", "defender"].includes(player.roleKey)
    ));
  }

  actualRoleKey(player) {
    if (!player?.alive) return null;
    if (player.id === this.revolutionaryId && !this.revolutionPowerUsed) return "revolutionary";
    if (player.id === this.maestroId) return "maestro";
    if (player.id === this.shamanId && !this.shamanSpent) return "shaman";
    if (player.id === this.cupidId) return "cupid";
    if (player.id === this.sheriffId) return "sheriff";
    if (player.id === this.clownId) return this.clownIsJoker ? "joker" : "clown";
    if (player.id === this.judgeId) return "judge";
    if (player.id === this.prosecutorId) return "prosecutor";
    if (player.id === this.defenderId) return "defender";
    if (this.assassinIds.includes(player.id)) return "assassin";
    if (player.role === "revolutionary" || player.job === "revolutionary" || player.roleKey === "revolutionary") {
      return "revolutionary";
    }
    if (player.role === "maestro" || player.job === "maestro" || player.roleKey === "maestro") {
      return "maestro";
    }
    if (player.role === "shaman" || player.job === "shaman" || player.roleKey === "shaman") {
      return "shaman";
    }
    if (player.role === "cupid" || player.job === "cupid" || player.roleKey === "cupid") {
      return "cupid";
    }
    if (player.role === "sheriff" || player.job === "sheriff" || player.roleKey === "sheriff") {
      return "sheriff";
    }
    if (player.role === "joker" || player.job === "joker" || player.roleKey === "joker") {
      return "joker";
    }
    if (player.role === "clown" || player.job === "clown" || player.roleKey === "clown") {
      return "clown";
    }
    if (["judge", "prosecutor", "defender"].includes(player.role)) return player.role;
    if (["judge", "prosecutor", "defender"].includes(player.job)) return player.job;
    if (["judge", "prosecutor", "defender"].includes(player.roleKey)) return player.roleKey;
    return "civilian";
  }

  getRoleAlignment(player) {
    if (!player) return "civilian";
    if (player.id === this.revolutionaryId || player.id === this.anonymousMayorId) return "danger";
    if (player.id === this.shamanId && !this.shamanSpent) return "danger";
    if (player.id === this.cupidId) return "danger";
    if (this.assassinIds.includes(player.id)) return "danger";
    if (player.id === this.clownId) return this.clownIsJoker ? "danger" : "danger";
    if (player.id === this.maestroId) return "neutral";
    if ([this.judgeId, this.prosecutorId, this.defenderId].includes(player.id)) return "neutral";
    if (player.id === this.sheriffId) return "civilian";

    const role = player.role || player.job || player.roleKey;
    if (["revolutionary", "assassin", "shaman", "cupid", "thief", "esper", "pierrot", "joker", "clown"].includes(role)) {
      return "danger";
    }
    if (["maestro", "prophet"].includes(role)) return "neutral";
    if (["judge", "prosecutor", "defender"].includes(role)) return "neutral";

    // 확장용: 꽃미남이 치명적 유혹으로 연인을 만든 상태라면 danger, 아니라면 neutral로 분기하면 된다.
    if (role === "heartthrob") return player.hasFatalLover ? "danger" : "neutral";

    return "civilian";
  }

  canUseSheriffPower(viewer = this.human()) {
    const roles = this.viewerRolePayload(viewer);
    return roles.isSheriff
      && this.phase === "choosing"
      && !this.sheriffPowerUsed
      && this.alivePlayers().some((player) => player.id !== viewer.id);
  }

  selectSheriffTarget(targetId) {
    const sheriff = this.human();
    const target = this.playerById(targetId);
    if (!this.canUseSheriffPower(sheriff) || !target?.alive || target.id === sheriff.id) return;
    this.pendingSheriffTargetId = target.id;
    this.render();
  }

  useSheriffJustice(actor = this.human(), targetId = this.pendingSheriffTargetId, shouldRender = true) {
    const sheriff = actor;
    const target = this.playerById(targetId);
    if (!this.canUseSheriffPower(sheriff) || !target?.alive || target.id === sheriff.id) return;

    this.sheriffPowerUsed = true;
    this.pendingSheriffTargetId = null;
    const alignment = this.getRoleAlignment(target);
    const eliminatedIds = [];
    this.addLog("보안관의 정의 집행이 발동했습니다.", true);

    if (alignment === "danger") {
      eliminatedIds.push(target.id);
      this.addLog(`보안관의 정의 집행이 성공했습니다. ${target.name}님이 탈락했습니다.`, true);
    } else if (alignment === "neutral") {
      eliminatedIds.push(sheriff.id, target.id);
      this.addLog("보안관의 정의 집행이 중립 대상을 향해 발동되어 두 플레이어가 함께 탈락했습니다.", true);
    } else {
      eliminatedIds.push(sheriff.id);
      this.addLog("보안관의 정의 집행이 빗나가 보안관이 탈락했습니다.", true);
    }

    this.applyImmediateEliminations(eliminatedIds, shouldRender);
  }

  applyImmediateEliminations(eliminatedIds, shouldRender = true) {
    const uniqueIds = [...new Set(eliminatedIds)].filter((id) => this.playerById(id)?.alive);
    if (!uniqueIds.length) {
      if (shouldRender) this.render();
      return;
    }

    uniqueIds.forEach((id) => {
      const player = this.playerById(id);
      if (player) player.alive = false;
    });
    this.playEliminationSound();
    this.successorIds = this.successorIds.filter((id) => this.playerById(id)?.alive);
    if (this.courtActive && uniqueIds.some((id) => this.courtRoleIds().includes(id))) {
      this.endCourtSystem();
    }

    if (uniqueIds.includes(this.anonymousMayorId)) {
      this.startFinalEdict();
      if (shouldRender) this.render();
      return;
    }

    if (uniqueIds.includes(this.mayorId) && !this.mayorSystemGone) {
      this.resolveSuccessionAfterMayorDeath();
    } else if (this.successionDuel) {
      this.successionDuel.ids = this.successionDuel.ids.filter((id) => this.playerById(id)?.alive);
      if (this.successionDuel.ids.length < 2) this.resolveSuccessionAfterMayorDeath();
    }

    this.checkVictoryAfterElimination();
    if (shouldRender) this.render();
  }

  selectAssassinTarget(targetId) {
    const target = this.playerById(targetId);
    const assassin = this.human();
    if (!this.canUseAssassinPower(assassin) || !target?.alive || target.id === assassin.id) return;
    this.pendingAssassinTargetId = target.id;
    this.render();
  }

  selectAssassinRole(roleKey) {
    if (!this.canUseAssassinPower()) return;
    if (!this.assassinationRoles().some((role) => role.key === roleKey)) return;
    this.pendingAssassinRole = roleKey;
    this.render();
  }

  useAssassination(actor = this.human(), targetId = this.pendingAssassinTargetId, guessedRole = this.pendingAssassinRole, shouldRender = true) {
    const assassin = actor;
    const target = this.playerById(targetId);
    if (!this.canUseAssassinPower(assassin) || !target?.alive || target.id === assassin.id || !guessedRole) return;

    this.assassinPowerUsedIds.push(assassin.id);
    const success = this.actualRoleKey(target) === guessedRole;
    const eliminated = success ? target : assassin;
    this.pendingAssassinTargetId = null;
    this.pendingAssassinRole = null;

    if (eliminated.id === this.anonymousMayorId) {
      if (success) {
        this.addLog(`암살이 성공하여 ${target.name}님이 탈락했습니다.`, true);
      } else {
        this.addLog("암살이 실패하여 암살자가 탈락했습니다.", true);
      }
      this.startFinalEdict();
      if (shouldRender) this.render();
      return;
    }

    eliminated.alive = false;
    this.playEliminationSound();
    this.successorIds = this.successorIds.filter((id) => this.playerById(id)?.alive);

    if (success) {
      this.addLog(`암살이 성공하여 ${target.name}님이 탈락했습니다.`, true);
    } else {
      this.addLog("암살이 실패하여 암살자가 탈락했습니다.", true);
    }

    if (eliminated.id === this.mayorId && !this.mayorSystemGone) {
      this.resolveSuccessionAfterMayorDeath();
    } else if (this.successionDuel) {
      this.successionDuel.ids = this.successionDuel.ids.filter((id) => this.playerById(id)?.alive);
      if (this.successionDuel.ids.length < 2) this.resolveSuccessionAfterMayorDeath();
    }

    if (this.processCupidLoverDeaths()) {
      if (shouldRender) this.render();
      return;
    }

    const survivors = this.alivePlayers();
    if (survivors.length <= 1) {
      this.phase = "over";
      if (survivors.length === 1) {
        this.addLog(`${survivors[0].name} 최종 생존. 승리!`, true);
        this.showVictory(survivors[0]);
      } else {
        this.addLog("모두 동시에 탈락했습니다. 생존자가 없습니다.", true);
        this.showVictory(null);
      }
    }

    if (shouldRender) this.render();
  }

  canUseRevolutionPower(viewer = this.human()) {
    return viewer?.alive
      && viewer.id === this.revolutionaryId
      && !this.revolutionPowerUsed
      && this.phase === "choosing"
      && this.mayorId !== null
      && this.anonymousMayorId === null
      && !this.mayorSystemGone;
  }

  selectRevolutionTarget(targetId) {
    const target = this.playerById(targetId);
    const human = this.human();
    if (!target?.alive || target.id === human.id) return;
    if (this.phase === "candidateBlock") {
      this.pendingRevolutionTargetId = target.id;
    } else if (this.canUseRevolutionPower(human)) {
      this.pendingRevolutionTargetId = target.id;
    }
    this.render();
  }

  confirmRevolutionPanelAction() {
    if (this.phase === "edictSelect") {
      this.applyFinalEdict(this.pendingEdictTargetId);
      return;
    }

    if (this.phase === "candidateBlock") {
      if (!this.applyCandidateBlock(this.pendingRevolutionTargetId)) return;
      this.pendingRevolutionTargetId = null;
      this.startElection("게임 시작 전 시장 투표가 시작되었습니다.");
      this.render();
      return;
    }

    this.useRevolution();
  }

  useRevolution(actor = this.human(), targetId = this.pendingRevolutionTargetId, shouldRender = true) {
    const revolutionary = actor;
    const target = this.playerById(targetId);
    if (!this.canUseRevolutionPower(revolutionary) || !target?.alive || target.id === revolutionary.id) return;

    this.revolutionPowerUsed = true;
    this.pendingRevolutionTargetId = null;

    if (target.id === this.mayorId) {
      target.alive = false;
      this.playEliminationSound();
      this.addLog("혁명이 성공하여 기존 시장이 몰락했습니다. 새로운 시장이 어둠 속에 숨어들었습니다.", true);
      this.mayorId = null;
      this.anonymousMayorId = revolutionary.id;
      this.successorIds = [];
      this.successionDuel = null;
      this.phase = "choosing";
      this.checkVictoryAfterElimination();
      if (shouldRender) this.render();
      return;
    }

    revolutionary.alive = false;
    this.playEliminationSound();
    this.addLog("혁명이 실패하여 혁명가가 탈락했습니다.", true);
    this.checkVictoryAfterElimination();
    if (shouldRender) this.render();
  }

  canUseDivineGrace(viewer = this.human()) {
    return viewer?.alive
      && viewer.id === this.anonymousMayorId
      && this.phase === "choosing"
      && !this.anonymousMayorGraceUsed
      && this.alivePlayers().some((player) => player.id !== viewer.id);
  }

  selectGraceTarget(targetId) {
    const target = this.playerById(targetId);
    if (!this.canUseDivineGrace() || !target?.alive || target.id === this.human().id) return;
    this.pendingGraceTargetId = target.id;
    this.render();
  }

  useDivineGrace(actor = this.human(), targetId = this.pendingGraceTargetId, shouldRender = true) {
    const target = this.playerById(targetId);
    if (!this.canUseDivineGrace(actor) || !target?.alive || target.id === actor.id) return;
    this.anonymousMayorGraceUsed = true;
    this.pendingGraceTargetId = null;
    target.alive = false;
    this.playEliminationSound();
    this.addLog(`신의 은총으로 ${target.name}님이 탈락했습니다.`, true);
    this.successorIds = this.successorIds.filter((id) => this.playerById(id)?.alive);
    this.checkVictoryAfterElimination();
    if (shouldRender) this.render();
  }

  startFinalEdict() {
    if (this.anonymousMayorId === null) return;
    const anonymousMayor = this.playerById(this.anonymousMayorId);
    const targets = this.alivePlayers().filter((player) => player.id !== this.anonymousMayorId);
    if (anonymousMayor?.alive && targets.length === 0) {
      this.phase = "over";
      this.addLog("익명 시장이 최후의 칙령으로 마지막 상대를 제거하고 승리했습니다.", true);
      this.showVictory(anonymousMayor);
      return;
    }
    this.phase = "edictSelect";
    this.pendingEdictTargetId = null;
    this.edictSecondsLeft = 10;
    this.addLog("익명 시장의 최후의 칙령이 내려졌습니다.", true);

    if (this.human().id === this.anonymousMayorId && this.human().alive) {
      this.startEdictTimer();
      return;
    }

    this.applyFinalEdict(this.randomEdictTargetId(), true);
  }

  randomEdictTargetId() {
    const targets = this.alivePlayers().filter((player) => player.id !== this.anonymousMayorId);
    return targets[Math.floor(Math.random() * targets.length)]?.id ?? null;
  }

  selectEdictTarget(targetId) {
    const target = this.playerById(targetId);
    if (this.phase !== "edictSelect" || !target?.alive || target.id === this.anonymousMayorId) return;
    this.pendingEdictTargetId = target.id;
    this.render();
  }

  startEdictTimer() {
    this.clearEdictTimer();
    this.edictTimer = window.setInterval(() => {
      this.edictSecondsLeft -= 1;
      if (this.edictSecondsLeft <= 0) this.applyFinalEdict(this.randomEdictTargetId(), true);
      this.render();
    }, 1000);
  }

  clearEdictTimer() {
    if (!this.edictTimer) return;
    window.clearInterval(this.edictTimer);
    this.edictTimer = null;
  }

  applyFinalEdict(targetId, random = false) {
    const anonymousMayor = this.playerById(this.anonymousMayorId);
    const target = this.playerById(targetId);
    if (!anonymousMayor?.alive || !target?.alive || target.id === anonymousMayor.id) return;
    this.clearEdictTimer();
    if (random) this.addLog("최후의 칙령 대상이 무작위로 정해졌습니다.");
    target.alive = false;
    this.playEliminationSound();
    this.addLog(`${target.name}님이 최후의 칙령으로 탈락했습니다.`, true);

    const survivorsAfterTarget = this.alivePlayers();
    if (survivorsAfterTarget.length === 1 && survivorsAfterTarget[0].id === anonymousMayor.id) {
      this.phase = "over";
      this.addLog("익명 시장이 최후의 칙령으로 마지막 상대를 제거하고 승리했습니다.", true);
      this.showVictory(anonymousMayor);
      this.render();
      return;
    }

    anonymousMayor.alive = false;
    this.playEliminationSound();
    this.addLog(`익명 시장 ${anonymousMayor.name}님이 탈락했습니다.`, true);
    this.anonymousMayorId = null;
    this.mayorId = null;
    this.mayorSystemGone = true;
    this.successorIds = [];
    this.successionDuel = null;
    this.addLog("익명 시장이 몰락하여 시장 체제가 사라졌습니다.", true);
    this.checkVictoryAfterElimination();
    if (this.phase !== "over") this.phase = "choosing";
    this.render();
  }

  checkVictoryAfterElimination() {
    if (this.processCupidLoverDeaths()) return true;
    const survivors = this.alivePlayers();
    if (survivors.length > 1) {
      if (this.phase === "choosing") {
        this.beginCupidSelectionIfNeeded(() => {
          this.phase = "choosing";
          this.render();
        });
      }
      return false;
    }
    this.phase = "over";
    if (survivors.length === 1) {
      this.addLog(`${survivors[0].name} 최종 생존. 승리!`, true);
      this.showVictory(survivors[0]);
    } else {
      this.addLog("모두 동시에 탈락했습니다. 생존자가 없습니다.", true);
      this.showVictory(null);
    }
    return true;
  }

  viewerRolePayload(viewer) {
    const isMayor = viewer?.alive && viewer.id === this.mayorId;
    const isSuccessor = viewer?.alive && this.successorIds.includes(viewer.id);
    const isAssassin = viewer?.alive && this.assassinIds.includes(viewer.id);
    const isRevolutionary = viewer?.alive && viewer.id === this.revolutionaryId && !this.revolutionPowerUsed;
    const isAnonymousMayor = viewer?.alive && viewer.id === this.anonymousMayorId;
    const isMaestro = viewer?.alive && viewer.id === this.maestroId;
    const isShaman = viewer?.alive && viewer.id === this.shamanId;
    const isCupid = viewer?.alive && viewer.id === this.cupidId;
    const isSheriff = viewer?.alive && viewer.id === this.sheriffId;
    const isClown = viewer?.alive && viewer.id === this.clownId && !this.clownIsJoker;
    const isJoker = viewer?.alive && viewer.id === this.clownId && this.clownIsJoker;
    const isJudge = viewer?.alive && viewer.id === this.judgeId;
    const isProsecutor = viewer?.alive && viewer.id === this.prosecutorId;
    const isDefender = viewer?.alive && viewer.id === this.defenderId;

    return {
      isMayor,
      isSuccessor,
      isAssassin,
      isRevolutionary,
      isAnonymousMayor,
      isMaestro,
      isShaman,
      isCupid,
      isSheriff,
      isClown,
      isJoker,
      isJudge,
      isProsecutor,
      isDefender,
    };
  }

  shuffle(items) {
    return [...items].sort(() => Math.random() - 0.5);
  }

  livingSuccessors() {
    const successorSet = new Set(this.successorIds);
    return this.alivePlayers().filter((player) => successorSet.has(player.id));
  }

  canBecomePublicMayor(player) {
    return Boolean(player?.alive) && player.id !== this.revolutionaryId;
  }

  resolveSuccessionAfterMayorDeath() {
    const successors = this.livingSuccessors().filter((player) => this.canBecomePublicMayor(player));
    this.mayorId = null;

    if (successors.length >= 2) {
      this.successionDuel = { ids: successors.slice(0, 2).map((player) => player.id) };
      this.successorIds = this.successionDuel.ids;
      this.addLog("시장이 탈락하여 비밀 후계자 결투가 시작됩니다.", true);
      return;
    }

    if (successors.length === 1) {
      this.mayorId = successors[0].id;
      this.successionDuel = null;
      this.addLog("남은 후계자가 새 시장이 되었습니다.", true);
      this.addLog(`새 시장은 ${successors[0].name}입니다.`, true);
      this.beginSuccessorAssignment();
      return;
    }

    const candidates = this.alivePlayers().filter((player) => this.canBecomePublicMayor(player));
    if (!candidates.length) return;
    const randomMayor = candidates[Math.floor(Math.random() * candidates.length)];
    this.mayorId = randomMayor.id;
    this.successionDuel = null;
    this.successorIds = [];
    this.addLog("후계자가 모두 사라져 무작위로 새 시장이 선출되었습니다.", true);
    this.addLog(`새 시장은 ${randomMayor.name}입니다.`, true);
    this.beginSuccessorAssignment();
  }

  resolveSuccessionDuel(result) {
    if (!this.successionDuel) return;
    const duelists = this.successionDuel.ids
      .map((id) => this.playerById(id))
      .filter((player) => this.canBecomePublicMayor(player));

    if (duelists.length < 2) {
      this.resolveSuccessionAfterMayorDeath();
      return;
    }

    const [first, second] = duelists;
    if (first.pick === second.pick) {
      this.addLog("후계자 결투가 무승부로 끝났습니다. 다음 라운드에도 결투가 유지됩니다.", true);
      return;
    }

    const winner = CHOICES[first.pick].beats === second.pick ? first : second;
    const loser = winner.id === first.id ? second : first;
    loser.alive = false;
    result.eliminatedIds.push(loser.id);
    this.playEliminationSound();
    this.addLog(`후계자 결투 패배로 ${loser.name} 탈락.`, true);
    this.addLog("후계자 결투 결과, 새 시장이 탄생했습니다.", true);
    this.mayorId = winner.id;
    this.successionDuel = null;
    this.successorIds = [];
    this.addLog(`새 시장은 ${winner.name}입니다.`, true);
    this.beginSuccessorAssignment();
  }

  canEditLobby() {
    return this.phase === "waiting" || this.phase === "over";
  }

  lobbyFull() {
    return this.players.length >= MAX_PLAYERS;
  }

  addAiPlayer() {
    if (this.phase !== "waiting") return;
    if (this.lobbyFull()) {
      this.addLog("로비가 가득 찼습니다.");
      this.render();
      return;
    }

    const usedNames = new Set(this.players.map((player) => player.name));
    const baseName = AI_NAMES.find((name) => !usedNames.has(name)) || `AI ${this.nextPlayerId}`;
    this.players.push({
      id: this.nextPlayerId++,
      name: baseName,
      alive: true,
      isHuman: false,
      type: "ai",
      pick: null,
      vote: null,
    });
    this.addLog(`${baseName} AI가 로비에 참가했습니다.`);
    this.render();
  }

  inviteFriend(friendName) {
    if (this.phase !== "waiting") return;
    if (this.lobbyFull()) {
      this.addLog("로비가 가득 찼습니다.");
      this.render();
      return;
    }
    if (this.players.some((player) => player.name.toLowerCase() === friendName.toLowerCase())) {
      this.addLog(`${friendName}은 이미 로비에 있습니다.`);
      this.render();
      return;
    }

    this.players.push({
      id: this.nextPlayerId++,
      name: friendName,
      alive: true,
      isHuman: false,
      type: "friend",
      pick: null,
      vote: null,
    });
    this.addLog(`${friendName}에게 초대를 보냈고 로비에 참가했습니다.`, true);
    this.render();
  }

  loadFriends() {
    try {
      const stored = JSON.parse(localStorage.getItem("rps-survival-friends") || "[]");
      return Array.isArray(stored) ? stored.filter(Boolean).slice(0, 30) : [];
    } catch {
      return [];
    }
  }

  saveFriends() {
    localStorage.setItem("rps-survival-friends", JSON.stringify(this.friends));
  }

  addFriend(value) {
    const name = String(value || "").trim().replace(/\s+/g, " ").slice(0, 16);
    if (!name) return;
    if (this.friends.some((friend) => friend.toLowerCase() === name.toLowerCase())) {
      this.friendInput.value = "";
      this.addLog(`${name}은 이미 친구 목록에 있습니다.`);
      this.renderFriends();
      return;
    }

    this.friends.unshift(name);
    this.friends = this.friends.slice(0, 30);
    this.friendInput.value = "";
    this.saveFriends();
    this.addLog(`${name}을 친구 목록에 추가했습니다.`);
    this.renderFriends();
    this.renderLogs();
  }

  removeFriend(index) {
    const [removed] = this.friends.splice(index, 1);
    this.saveFriends();
    if (removed) this.addLog(`${removed}을 친구 목록에서 삭제했습니다.`);
    this.renderFriends();
    this.renderLogs();
  }

  addRoundLogs(result) {
    const countsText = formatCounts(result.counts);
    this.addLog(`${this.round}라운드 선택 수: ${countsText}`, true);
    this.addLog(result.reason, result.decidedByMayor);

    if (result.baseChoice) {
      this.addLog(`기준 패: ${choiceName(result.baseChoice)}`, true);
      this.addLog(`탈락 대상 패: ${choiceName(result.losingChoice)}`);
    } else {
      this.addLog("기준 패: 없음");
    }

    if (result.eliminatedIds.length) {
      const names = result.eliminatedIds.map((id) => this.playerById(id).name).join(", ");
      this.addLog(`${choiceName(result.losingChoice)}를 낸 플레이어 탈락: ${names}`, true);
      if (result.eliminatedIds.includes(this.human().id)) {
        this.addLog("당신은 탈락했습니다. 남은 참가자들의 생존전은 자동으로 진행됩니다.", true);
      }
    } else {
      this.addLog("기준 패에게 지는 패를 낸 플레이어가 없어 아무도 탈락하지 않았습니다.");
    }
  }

  randomChoice() {
    return CHOICE_ORDER[Math.floor(Math.random() * CHOICE_ORDER.length)];
  }

  randomCandidateId(voterId, candidates) {
    const available = candidates.filter((candidate) => candidate.id !== voterId);
    const pool = available.length ? available : candidates;
    return pool[Math.floor(Math.random() * pool.length)]?.id ?? null;
  }

  formatVoteTally(tally) {
    return Object.entries(tally)
      .map(([id, count]) => `${this.playerById(Number(id)).name} ${count}표`)
      .join(" / ");
  }

  addLog(message, important = false) {
    this.logs.unshift({ message, important });
    this.logs = this.logs.slice(0, 12);
  }

  alivePlayers() {
    return this.players.filter((player) => player.alive);
  }

  human() {
    return this.players[0];
  }

  playerById(id) {
    return this.players.find((player) => player.id === id);
  }

  visibleMayorLabel(mayorDisabled, mayor) {
    const human = this.human();
    if (this.mayorSystemGone) return "시장 없음";
    if (this.anonymousMayorId !== null) return "익명 시장";
    if (human?.alive && human.id === this.revolutionaryId && !this.revolutionPowerUsed) return "시장 정보 차단됨";
    if (mayorDisabled) return "비활성";
    return mayor?.alive ? mayor.name : "없음";
  }

  render() {
    const alive = this.alivePlayers();
    const mayor = this.playerById(this.mayorId);
    this.roundValue.textContent = this.round;
    this.aliveValue.textContent = alive.length;
    const mayorDisabled = this.phase !== "waiting" && this.phase !== "over" && alive.length <= 2;
    this.mayorValue.textContent = this.visibleMayorLabel(mayorDisabled, mayor);
    this.phaseValue.textContent = this.phaseText();
    this.lobbyCount.textContent = `${this.players.length} / ${MAX_PLAYERS}`;
    this.addAiButton.disabled = this.phase !== "waiting" || this.lobbyFull();
    this.renderStage();
    this.renderSecretInfo();
    this.renderMusicButton();
    this.renderVotes();
    this.renderSuccessorSelection();
    this.renderAssassinAction();
    this.renderRevolutionAction();
    this.renderGraceAction();
    this.renderMaestroAction();
    this.renderShamanAction();
    this.renderCupidAction();
    this.renderSheriffAction();
    this.renderClownAction();
    this.renderCourtAction();
    this.renderChoices();
    this.renderBattleSlots();
    this.renderPlayers();
    this.renderFriends();
    this.renderLogs();
    this.scheduleAutomation();
  }

  renderStage() {
    const isVoting = this.phase === "voting";
    this.lobbyPanel.hidden = this.phase !== "waiting";
    this.votePanel.hidden = !isVoting;
    this.successorPanel.hidden = this.phase !== "successorSelect";
    this.choicePanel.hidden = isVoting
      || this.phase === "successorSelect"
      || this.phase === "candidateBlock"
      || this.phase === "edictSelect"
      || this.phase === "resistance"
      || this.phase === "fateSwap"
      || this.phase === "deathSentence"
      || this.phase === "cupidSelect"
      || this.phase === "courtSelect";

    if (this.phase === "waiting") {
      this.stageEyebrow.textContent = "로비";
      this.stageTitle.textContent = "참가자를 모으세요";
      this.startButton.textContent = "시작";
      this.startButton.disabled = this.players.length < 2;
      this.resultBanner.textContent = this.players.length < 2
        ? "AI를 추가하거나 친구를 초대하면 게임을 시작할 수 있습니다."
        : "시작 버튼을 누르면 시장 투표 후 생존전이 시작됩니다.";
      return;
    }

    if (isVoting) {
      this.stageEyebrow.textContent = "시장 투표";
      this.stageTitle.textContent = "새 시장을 뽑으세요";
      this.startButton.textContent = "투표 중";
      this.startButton.disabled = true;
      this.resultBanner.textContent = "본인 투표는 금지됩니다. 생존자만 투표하고 생존자만 후보가 됩니다.";
      return;
    }

    if (this.phase === "candidateBlock") {
      this.stageEyebrow.textContent = "혁명가 권한";
      this.stageTitle.textContent = "첫 시장 후보를 제외하세요";
      this.startButton.textContent = "후보 제외 중";
      this.startButton.disabled = true;
      this.resultBanner.textContent = `10초 안에 후보에서 제외할 생존자 1명을 선택하세요. 남은 시간: ${this.candidateBlockSecondsLeft}초`;
      return;
    }

    if (this.phase === "successorSelect") {
      this.stageEyebrow.textContent = "시장 권한";
      this.stageTitle.textContent = "비밀 후계자를 지정하세요";
      this.startButton.textContent = "후계자 지정 중";
      this.startButton.disabled = true;
      this.resultBanner.textContent = "시장 본인은 후계자가 될 수 없습니다. 가능한 경우 서로 다른 2명을 선택하세요.";
      return;
    }

    if (this.phase === "edictSelect") {
      this.stageEyebrow.textContent = "최후의 칙령";
      this.stageTitle.textContent = "함께 몰락시킬 대상을 선택하세요";
      this.startButton.textContent = "칙령 대기";
      this.startButton.disabled = true;
      this.resultBanner.textContent = `익명 시장의 탈락이 예정되었습니다. 최후의 칙령 대상 선택 남은 시간: ${this.edictSecondsLeft}초`;
      return;
    }

    if (this.phase === "resistance") {
      this.stageEyebrow.textContent = "최면 저항전";
      this.stageTitle.textContent = "연타로 운명을 뒤집으세요";
      this.startButton.textContent = "저항전 진행";
      this.startButton.disabled = true;
      this.resultBanner.textContent = "최면 저항전이 진행 중입니다.";
      return;
    }

    if (this.phase === "fateSwap") {
      this.stageEyebrow.textContent = "운명 교환";
      this.stageTitle.textContent = "탈락 직전 운명을 바꾸세요";
      this.startButton.textContent = "주술 대기";
      this.startButton.disabled = true;
      this.resultBanner.textContent = `운명 교환 대상 선택 남은 시간: ${this.fateSecondsLeft}초`;
      return;
    }

    if (this.phase === "deathSentence") {
      this.stageEyebrow.textContent = "사망 선고";
      this.stageTitle.textContent = "금지된 주술 대상을 고르세요";
      this.startButton.textContent = "선고 대기";
      this.startButton.disabled = true;
      this.resultBanner.textContent = `사망 선고 대상 선택 남은 시간: ${this.deathSecondsLeft}초`;
      return;
    }

    if (this.phase === "cupidSelect") {
      this.stageEyebrow.textContent = "큐피트";
      this.stageTitle.textContent = "애인 2명을 지정하세요";
      this.startButton.textContent = "애인 지정 중";
      this.startButton.disabled = true;
      this.resultBanner.textContent = `애인 지정 남은 시간: ${this.cupidSecondsLeft}초`;
      return;
    }

    if (this.phase === "courtSelect") {
      this.stageEyebrow.textContent = "법정";
      this.stageTitle.textContent = "피고를 지정하세요";
      this.startButton.textContent = "피고 지정 중";
      this.startButton.disabled = true;
      this.resultBanner.textContent = `피고 지정 남은 시간: ${this.courtSecondsLeft}초`;
      return;
    }

    if (this.phase === "over") {
      this.stageEyebrow.textContent = "게임 종료";
      this.stageTitle.textContent = "생존전이 끝났습니다";
      this.startButton.textContent = "다시 시작";
      this.startButton.disabled = false;
      this.resultBanner.textContent = this.logs[0]?.message || "게임 종료";
      return;
    }

    this.stageEyebrow.textContent = "다수결 판정";
    this.stageTitle.textContent = "이번 라운드에 낼 패를 고르세요";
    this.startButton.textContent = "진행 중";
    this.startButton.disabled = true;
    this.resultBanner.textContent = this.phase === "reveal"
      ? this.logs[0]?.message || "선택 공개 중입니다."
      : "선택이 공개되면 최다 선택 패가 기준 패가 됩니다.";
  }

  renderMusicButton() {
    this.musicButton.setAttribute("aria-pressed", String(this.bgm.playing));
    this.musicButton.querySelector("span:last-child").textContent = this.bgm.playing ? "BGM 끄기" : "BGM 켜기";
  }

  renderSecretInfo() {
    const human = this.human();
    const mayor = this.playerById(this.mayorId);
    const viewerRoles = this.viewerRolePayload(human);
    const successorNames = this.successorIds
      .map((id) => this.playerById(id))
      .filter((player) => player?.alive)
      .map((player) => player.name);
    const duelActive = Boolean(this.successionDuel);
    const duelNames = (this.successionDuel?.ids || [])
      .map((id) => this.playerById(id))
      .filter((player) => player?.alive)
      .map((player) => player.name);

    this.secretPanel.classList.toggle("urgent", duelActive);
    this.secretPanel.hidden = this.mayorSystemGone;
    if (this.mayorSystemGone) return;

    if (viewerRoles.isAnonymousMayor) {
      this.secretTitle.textContent = "익명 시장";
      this.secretText.textContent = this.anonymousMayorGraceUsed
        ? "당신은 익명 시장입니다. 당신의 선택은 다수결 계산에서 +1표로 적용됩니다. 신의 은총은 이미 사용했습니다."
        : "당신은 익명 시장입니다. 당신의 선택은 다수결 계산에서 +1표로 적용됩니다.";
      return;
    }

    if (viewerRoles.isMaestro) {
      const target = this.playerById(this.maestroTargetId);
      this.secretTitle.textContent = "마에스트로";
      this.secretText.textContent = target?.alive
        ? `당신은 마에스트로입니다. 현재 최면 지휘 대상: ${target.name}`
        : "당신은 마에스트로입니다. 이번 라운드의 최면 지휘 대상은 아직 없습니다.";
      return;
    }

    if (viewerRoles.isShaman) {
      this.secretTitle.textContent = "주술사";
      this.secretText.textContent = this.shamanSpent
        ? "당신은 주술사입니다. 주술 능력 소진"
        : `당신은 주술사입니다. 운명 교환 사용 가능 · 운명 교환 연속 성공: ${this.shamanStreak} / 2`;
      return;
    }

    if (viewerRoles.isCupid) {
      const loverNames = this.cupidLoverIds.map((id) => this.playerById(id)?.name).filter(Boolean);
      this.secretTitle.textContent = "큐피트";
      this.secretText.textContent = `당신은 큐피트입니다. 현재 애인: ${loverNames.length ? loverNames.join(", ") : "없음"} · 애인 탈락: ${this.cupidLoveDeaths} / 4 · 애인 생존: ${this.loverSurvivalRounds} / 4`;
      return;
    }

    if (viewerRoles.isSheriff) {
      this.secretTitle.textContent = "보안관";
      this.secretText.textContent = this.sheriffPowerUsed
        ? "당신은 보안관입니다. 정의 집행 사용 완료"
        : "당신은 보안관입니다. 정의 집행 사용 가능";
      return;
    }

    if (viewerRoles.isJoker) {
      this.secretTitle.textContent = "조커";
      this.secretText.textContent = "당신은 조커입니다. 시장이 당신을 후계자로 선택하면 승리합니다.";
      return;
    }

    if (viewerRoles.isClown) {
      this.secretTitle.textContent = "삐에로";
      this.secretText.textContent = `당신은 삐에로입니다. 예측 실패: ${this.clownFailures} / 3`;
      return;
    }

    if (viewerRoles.isJudge) {
      const prosecutor = this.playerById(this.prosecutorId);
      const defender = this.playerById(this.defenderId);
      const defendant = this.playerById(this.defendantId);
      this.secretTitle.textContent = "판사";
      this.secretText.textContent = `당신은 판사입니다. 검사: ${prosecutor?.name || "없음"} / 변호사: ${defender?.name || "없음"} · 현재 피고: ${defendant?.name || "없음"}`;
      return;
    }

    if (viewerRoles.isProsecutor) {
      const defendant = this.playerById(this.defendantId);
      this.secretTitle.textContent = "검사";
      this.secretText.textContent = `당신은 검사입니다. 현재 피고: ${defendant?.name || "없음"} · 기소 성공: ${this.prosecutorSuccesses} / 3`;
      return;
    }

    if (viewerRoles.isDefender) {
      const defendant = this.playerById(this.defendantId);
      this.secretTitle.textContent = "변호사";
      this.secretText.textContent = `당신은 변호사입니다. 현재 피고: ${defendant?.name || "없음"} · 변호 성공: ${this.defenderSuccesses} / 3 · 변호 실패: ${this.defenderFailures} / 3`;
      return;
    }

    if (human?.alive && human.id === this.defendantId) {
      this.secretTitle.textContent = "피고";
      this.secretText.textContent = "당신은 피고로 지목되었습니다. 당신의 최종 선택은 변호사의 선택으로 결정됩니다.";
      return;
    }

    if (this.cupidLoverIds.includes(human.id)) {
      const partner = this.cupidLoverIds.map((id) => this.playerById(id)).find((player) => player?.id !== human.id);
      this.secretTitle.textContent = "애인";
      this.secretText.textContent = partner
        ? `당신은 ${partner.name}님과 애인입니다. 애인 생존: ${this.loverSurvivalRounds} / 4`
        : "당신은 애인입니다.";
      return;
    }

    if (duelActive) {
      this.secretTitle.textContent = "비밀 후계자 결투";
      if (this.successionDuel.ids.includes(human.id)) {
        const opponent = duelNames.find((name) => name !== human.name) || "상대 후계자";
        this.secretText.textContent = `당신은 비밀 후계자입니다. ${opponent}와 결투 중입니다. 이번 라운드의 일반 다수결 탈락 판정에서는 보호됩니다.`;
      } else {
        this.secretText.textContent = "시장 공석: 비밀 후계자 결투 진행 중";
      }
      return;
    }

    if (viewerRoles.isMayor) {
      this.secretTitle.textContent = "시장 전용 정보";
      this.secretText.textContent = successorNames.length
        ? `현재 지정한 비밀 후계자: ${successorNames.join(", ")}`
        : "지정된 비밀 후계자가 없습니다.";
      return;
    }

    if (viewerRoles.isSuccessor) {
      const others = successorNames.filter((name) => name !== human.name);
      this.secretTitle.textContent = "비밀 후계자";
      this.secretText.textContent = others.length
        ? `당신은 비밀 후계자입니다. 다른 후계자: ${others.join(", ")}`
        : "당신은 비밀 후계자입니다. 다른 후계자는 없습니다.";
      return;
    }

    if (viewerRoles.isAssassin) {
      this.secretTitle.textContent = "암살자";
      this.secretText.textContent = this.assassinPowerUsedIds.includes(human.id)
        ? "당신은 암살자입니다. 암살 능력을 이미 사용했습니다."
        : "당신은 암살자입니다.";
      return;
    }

    if (viewerRoles.isRevolutionary) {
      this.secretTitle.textContent = "혁명가";
      this.secretText.textContent = "당신은 혁명가입니다.";
      return;
    }

    this.secretTitle.textContent = "비밀 후계자";
    this.secretText.textContent = successorNames.length ? "비밀 후계자 지정 완료" : "비밀 후계자 지정 전입니다.";
  }

  renderAssassinAction() {
    this.inspectorGrid.innerHTML = "";
    this.assassinRoleGrid.innerHTML = "";
    const canUse = this.canUseAssassinPower();
    this.inspectorPanel.hidden = !canUse;
    if (!canUse) return;

    const targets = this.alivePlayers().filter((player) => player.id !== this.human().id);
    if (!targets.some((target) => target.id === this.pendingAssassinTargetId)) {
      this.pendingAssassinTargetId = null;
    }
    if (!this.assassinationRoles().some((role) => role.key === this.pendingAssassinRole)) {
      this.pendingAssassinRole = null;
    }
    this.inspectorHint.textContent = "암살할 생존자 1명과 추리한 직업 1개를 선택하세요. 맞히면 대상이 탈락하고, 틀리면 암살자 본인이 탈락합니다.";

    targets.forEach((target) => {
      const selected = this.pendingAssassinTargetId === target.id;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `vote-card ${selected ? "selected" : ""}`;
      button.innerHTML = `
        <span class="vote-name">${this.escape(target.name)}</span>
        <span class="vote-meta">${selected ? "암살 대상 선택됨" : "암살 대상"}</span>
      `;
      button.addEventListener("click", () => this.selectAssassinTarget(target.id));
      this.inspectorGrid.append(button);
    });

    this.assassinationRoles().forEach((role) => {
      const selected = this.pendingAssassinRole === role.key;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `role-card ${selected ? "selected" : ""}`;
      button.textContent = role.label;
      button.addEventListener("click", () => this.selectAssassinRole(role.key));
      this.assassinRoleGrid.append(button);
    });

    this.confirmAssassinationButton.disabled = !this.pendingAssassinTargetId || !this.pendingAssassinRole;
  }

  renderRevolutionAction() {
    this.revolutionGrid.innerHTML = "";
    this.revolutionPanel.hidden = true;
    const human = this.human();

    if (this.phase === "edictSelect" && human.id === this.anonymousMayorId && human.alive) {
      const targets = this.alivePlayers().filter((player) => player.id !== human.id);
      this.revolutionPanel.hidden = false;
      this.revolutionTitle.textContent = "최후의 칙령";
      this.revolutionHint.textContent = `함께 탈락시킬 생존자 1명을 선택하세요. 남은 시간: ${this.edictSecondsLeft}초`;
      this.confirmRevolutionButton.textContent = "칙령 확정";
      this.confirmRevolutionButton.disabled = !this.pendingEdictTargetId;
      targets.forEach((target) => this.revolutionGrid.append(this.createTargetButton({
        target,
        selected: this.pendingEdictTargetId === target.id,
        selectedText: "칙령 대상 선택됨",
        idleText: "칙령 대상",
        onClick: () => this.selectEdictTarget(target.id),
      })));
      return;
    }

    if (this.phase === "candidateBlock" && human.id === this.revolutionaryId && human.alive) {
      const targets = this.alivePlayers().filter((player) => player.id !== human.id);
      this.revolutionPanel.hidden = false;
      this.revolutionTitle.textContent = "후보 제외";
      this.revolutionHint.textContent = `첫 시장 후보에서 제외할 생존자 1명을 선택하세요. 남은 시간: ${this.candidateBlockSecondsLeft}초`;
      this.confirmRevolutionButton.textContent = "후보 제외 확정";
      this.confirmRevolutionButton.disabled = !this.pendingRevolutionTargetId;
      targets.forEach((target) => this.revolutionGrid.append(this.createTargetButton({
        target,
        selected: this.pendingRevolutionTargetId === target.id,
        selectedText: "후보 제외 대상 선택됨",
        idleText: "후보 제외 대상",
        onClick: () => this.selectRevolutionTarget(target.id),
      })));
      return;
    }

    if (!this.canUseRevolutionPower(human)) return;
    const targets = this.alivePlayers().filter((player) => player.id !== human.id);
    this.revolutionPanel.hidden = false;
    this.revolutionTitle.textContent = "혁명";
    this.revolutionHint.textContent = "현재 공개 시장이라고 생각하는 생존자 1명을 지목하세요. 성공하면 익명 시장이 되고, 실패하면 혁명가가 탈락합니다.";
    this.confirmRevolutionButton.textContent = "혁명 실행";
    this.confirmRevolutionButton.disabled = !this.pendingRevolutionTargetId;
    targets.forEach((target) => this.revolutionGrid.append(this.createTargetButton({
      target,
      selected: this.pendingRevolutionTargetId === target.id,
      selectedText: "혁명 대상 선택됨",
      idleText: "혁명 대상",
      onClick: () => this.selectRevolutionTarget(target.id),
    })));
  }

  renderGraceAction() {
    this.graceGrid.innerHTML = "";
    const canUse = this.canUseDivineGrace();
    this.gracePanel.hidden = !canUse;
    if (!canUse) return;

    const human = this.human();
    const targets = this.alivePlayers().filter((player) => player.id !== human.id);
    if (!targets.some((target) => target.id === this.pendingGraceTargetId)) this.pendingGraceTargetId = null;
    this.confirmGraceButton.disabled = !this.pendingGraceTargetId;
    targets.forEach((target) => this.graceGrid.append(this.createTargetButton({
      target,
      selected: this.pendingGraceTargetId === target.id,
      selectedText: "은총 대상 선택됨",
      idleText: "은총 대상",
      onClick: () => this.selectGraceTarget(target.id),
    })));
  }

  renderMaestroAction() {
    this.maestroGrid.innerHTML = "";
    const human = this.human();
    const canUse = human?.alive && human.id === this.maestroId && this.phase === "choosing";
    this.maestroPanel.hidden = !canUse;
    if (!canUse) return;

    const targets = this.alivePlayers().filter((player) => player.id !== human.id);
    if (!targets.some((target) => target.id === this.maestroTargetId)) this.maestroTargetId = null;
    const target = this.playerById(this.maestroTargetId);
    this.maestroHint.textContent = target?.alive
      ? `현재 지정한 대상: ${target.name}. 라운드 선택 전까지 바꿀 수 있습니다.`
      : "이번 라운드에 조종할 생존자 1명을 선택하세요. 선택하지 않으면 최면 지휘는 발동하지 않습니다.";

    targets.forEach((candidate) => this.maestroGrid.append(this.createTargetButton({
      target: candidate,
      selected: this.maestroTargetId === candidate.id,
      selectedText: "최면 지휘 대상 선택됨",
      idleText: "최면 지휘 대상",
      onClick: () => this.selectMaestroTarget(candidate.id),
    })));
  }

  selectMaestroTarget(targetId) {
    const human = this.human();
    const target = this.playerById(targetId);
    if (this.phase !== "choosing" || human.id !== this.maestroId || !target?.alive || target.id === human.id) return;
    this.maestroTargetId = target.id;
    this.render();
  }

  renderShamanAction() {
    this.shamanGrid.innerHTML = "";
    const human = this.human();
    const isShaman = human?.alive && human.id === this.shamanId;
    const showFate = isShaman && this.phase === "fateSwap";
    const showDeath = isShaman && this.phase === "deathSentence";
    this.shamanPanel.hidden = !showFate && !showDeath;
    if (!showFate && !showDeath) return;

    if (showFate) {
      const targets = this.fateTargets();
      this.shamanTitle.textContent = "운명 교환";
      this.shamanHint.textContent = `생존자 1명을 선택하세요. 패 정보는 공개되지 않습니다. 남은 시간: ${this.fateSecondsLeft}초 · 연속 성공: ${this.shamanStreak} / 2`;
      this.confirmShamanButton.textContent = "운명 교환 시도";
      this.confirmShamanButton.disabled = !this.pendingFateTargetId;
      targets.forEach((target) => this.shamanGrid.append(this.createTargetButton({
        target,
        selected: this.pendingFateTargetId === target.id,
        selectedText: "교환 대상 선택됨",
        idleText: "교환 대상",
        onClick: () => this.selectFateTarget(target.id),
      })));
      return;
    }

    const targets = this.alivePlayers().filter((player) => player.id !== this.shamanId);
    this.shamanTitle.textContent = "사망 선고";
    this.shamanHint.textContent = `사망 선고 대상 1명을 선택하세요. 남은 시간: ${this.deathSecondsLeft}초`;
    this.confirmShamanButton.textContent = "사망 선고";
    this.confirmShamanButton.disabled = !this.pendingDeathTargetId;
    targets.forEach((target) => this.shamanGrid.append(this.createTargetButton({
      target,
      selected: this.pendingDeathTargetId === target.id,
      selectedText: "선고 대상 선택됨",
      idleText: "선고 대상",
      onClick: () => this.selectDeathTarget(target.id),
    })));
  }

  renderCupidAction() {
    this.cupidGrid.innerHTML = "";
    const human = this.human();
    const canSelect = human?.alive && human.id === this.cupidId && this.phase === "cupidSelect";
    this.cupidPanel.hidden = !canSelect;
    if (!canSelect) return;

    const targets = this.cupidCandidates();
    const selected = new Set(this.pendingCupidIds);
    this.cupidHint.textContent = `애인으로 지정할 생존자 2명을 선택하세요. 남은 시간: ${this.cupidSecondsLeft}초`;
    this.confirmCupidButton.disabled = selected.size < 2;

    targets.forEach((target) => this.cupidGrid.append(this.createTargetButton({
      target,
      selected: selected.has(target.id),
      selectedText: "애인 대상으로 선택됨",
      idleText: "애인 대상",
      onClick: () => this.toggleCupidTarget(target.id),
    })));
  }

  renderSheriffAction() {
    this.sheriffGrid.innerHTML = "";
    const human = this.human();
    const canUse = this.canUseSheriffPower(human);
    this.sheriffPanel.hidden = !canUse;
    if (!canUse) return;

    const targets = this.alivePlayers().filter((player) => player.id !== human.id);
    if (!targets.some((target) => target.id === this.pendingSheriffTargetId)) {
      this.pendingSheriffTargetId = null;
    }
    this.sheriffHint.textContent = this.sheriffPowerUsed
      ? "정의 집행 사용 완료"
      : "정의 집행할 생존자 1명을 선택하세요. 시장과 후계자가 아니라 실제 직업 성향을 판정합니다.";
    this.confirmSheriffButton.disabled = !this.pendingSheriffTargetId || this.sheriffPowerUsed;

    targets.forEach((target) => this.sheriffGrid.append(this.createTargetButton({
      target,
      selected: this.pendingSheriffTargetId === target.id,
      selectedText: "정의 집행 대상 선택됨",
      idleText: "정의 집행 대상",
      onClick: () => this.selectSheriffTarget(target.id),
    })));
  }

  renderClownAction() {
    this.clownGrid.innerHTML = "";
    const human = this.human();
    const canUse = human?.alive && human.id === this.clownId && !this.clownIsJoker && this.phase === "choosing";
    this.clownPanel.hidden = !canUse;
    if (!canUse) return;

    const locked = this.clownPredictionRound === this.round;
    const targets = this.clownPredictionTargets();
    const prediction = locked ? this.clownPrediction?.predictions || {} : this.pendingClownPrediction;
    const complete = targets.length > 0 && targets.every((target) => typeof prediction[target.id] === "boolean");

    this.clownHint.textContent = locked
      ? `이번 라운드 운명 예측 확정 · 예측 실패: ${this.clownFailures} / 3`
      : `각 생존자의 라운드 종료 상태를 예측하세요. 예측 실패: ${this.clownFailures} / 3`;
    this.confirmClownButton.disabled = locked || !complete;
    this.skipClownButton.disabled = false;

    targets.forEach((target) => {
      const row = document.createElement("div");
      row.className = "prediction-card";
      const expected = prediction[target.id];
      row.innerHTML = `
        <span class="vote-name">${this.escape(target.name)}</span>
        <div class="prediction-actions">
          <button type="button" class="${expected === true ? "selected" : ""}" ${locked ? "disabled" : ""}>생존 예상</button>
          <button type="button" class="${expected === false ? "selected" : ""}" ${locked ? "disabled" : ""}>탈락 예상</button>
        </div>
      `;
      const buttons = row.querySelectorAll("button");
      buttons[0].addEventListener("click", () => this.setClownPrediction(target.id, true));
      buttons[1].addEventListener("click", () => this.setClownPrediction(target.id, false));
      this.clownGrid.append(row);
    });
  }

  renderCourtAction() {
    this.courtGrid.innerHTML = "";
    this.courtPanel.hidden = true;
    const human = this.human();

    if (this.phase === "courtSelect" && human.id === this.judgeId && human.alive) {
      this.courtPanel.hidden = false;
      this.courtTitle.textContent = "피고 지정";
      this.courtHint.textContent = `피고로 지정할 생존자 1명을 선택하세요. 남은 시간: ${this.courtSecondsLeft}초`;
      this.confirmCourtButton.hidden = false;
      this.confirmCourtButton.textContent = "피고 지정";
      this.confirmCourtButton.disabled = !this.pendingCourtDefendantId;
      this.courtDefendantCandidates().forEach((target) => this.courtGrid.append(this.createTargetButton({
        target,
        selected: this.pendingCourtDefendantId === target.id,
        selectedText: "피고 선택됨",
        idleText: "피고 후보",
        onClick: () => this.selectCourtDefendant(target.id),
      })));
      return;
    }

    const isProsecutor = human.id === this.prosecutorId && human.alive && this.courtSystemAlive() && this.phase === "choosing";
    const isDefender = human.id === this.defenderId && human.alive && this.courtSystemAlive() && this.phase === "choosing";
    if (human.id === this.defendantId && human.alive && this.courtSystemAlive() && this.phase === "choosing") {
      this.courtPanel.hidden = false;
      this.courtTitle.textContent = "피고";
      this.courtHint.textContent = "당신의 최종 선택은 변호사의 선택으로 결정됩니다.";
      this.confirmCourtButton.hidden = false;
      this.confirmCourtButton.textContent = "라운드 진행";
      this.confirmCourtButton.disabled = false;
      return;
    }
    if (!isProsecutor && !isDefender) return;

    this.courtPanel.hidden = false;
    this.courtTitle.textContent = isProsecutor ? "검사 선택" : "변호사 선택";
    this.courtHint.textContent = isProsecutor
      ? "피고의 최종 패를 맞히기 위해 패를 선택하세요."
      : "피고에게 적용할 최종 패를 선택하세요.";
    this.confirmCourtButton.hidden = false;
    this.confirmCourtButton.textContent = "라운드 진행";
    this.confirmCourtButton.disabled = false;
    const currentPick = isProsecutor ? this.prosecutorPick : this.defenderPick;
    CHOICE_ORDER.forEach((choice) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `vote-card ${currentPick === choice ? "selected" : ""}`;
      button.innerHTML = `
        <span class="vote-name">${choiceSymbol(choice)} ${choiceName(choice)}</span>
        <span class="vote-meta">${currentPick === choice ? "선택됨" : "법정 선택"}</span>
      `;
      button.addEventListener("click", () => {
        if (isProsecutor) this.prosecutorPick = choice;
        if (isDefender) this.defenderPick = choice;
        this.render();
      });
      this.courtGrid.append(button);
    });
  }

  createTargetButton({ target, selected, selectedText, idleText, onClick }) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `vote-card ${selected ? "selected" : ""}`;
    button.innerHTML = `
      <span class="vote-name">${this.escape(target.name)}</span>
      <span class="vote-meta">${selected ? selectedText : idleText}</span>
    `;
    button.addEventListener("click", onClick);
    return button;
  }

  renderVotes() {
    this.voteGrid.innerHTML = "";
    if (this.phase !== "voting") return;

    const human = this.human();
    const candidates = this.mayorCandidates();
    candidates.forEach((candidate) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "vote-card";
      button.disabled = candidate.id === human.id;
      button.innerHTML = `
        <span class="vote-name">${this.escape(candidate.name)}</span>
        <span class="vote-meta">${candidate.id === human.id ? "본인 투표 불가" : "시장 후보"}</span>
      `;
      button.addEventListener("click", () => this.castHumanVote(candidate.id));
      this.voteGrid.append(button);
    });
  }

  renderSuccessorSelection() {
    this.successorGrid.innerHTML = "";
    if (this.phase !== "successorSelect") return;

    const candidates = this.successorCandidates();
    const targetCount = Math.min(2, candidates.length);
    this.successorHint.textContent = targetCount
      ? `후계자로 지정할 생존자 ${targetCount}명을 선택하세요.`
      : "지정할 수 있는 생존자가 없습니다.";
    this.confirmSuccessorsButton.disabled = this.pendingSuccessorIds.length < targetCount;

    candidates.forEach((candidate) => {
      const selected = this.pendingSuccessorIds.includes(candidate.id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `vote-card ${selected ? "selected" : ""}`;
      button.innerHTML = `
        <span class="vote-name">${this.escape(candidate.name)}</span>
        <span class="vote-meta">${selected ? "후계자 선택됨" : "후계자 후보"}</span>
      `;
      button.addEventListener("click", () => this.togglePendingSuccessor(candidate.id));
      this.successorGrid.append(button);
    });
  }

  renderChoices() {
    this.choiceGrid.innerHTML = "";
    CHOICE_ORDER.forEach((choice) => {
      const info = CHOICES[choice];
      const button = document.createElement("button");
      button.type = "button";
      button.className = `choice-card ${this.lastPlayerPick === choice ? "selected" : ""}`;
      button.style.setProperty("--accent", info.color);
      button.disabled = this.phase !== "choosing"
        || !this.human().alive
        || this.canSkipRps(this.human())
        || (this.courtSystemAlive() && this.human().id === this.defendantId);
      button.innerHTML = `
        <span class="choice-symbol">${info.symbol}</span>
        <span class="choice-name">${info.name}</span>
        <p class="choice-rule">${info.rule}</p>
      `;
      button.addEventListener("click", () => this.choose(choice));
      this.choiceGrid.append(button);
    });
  }

  renderBattleSlots() {
    if (this.shouldHideRoundPicksFromHuman()) {
      this.playerPick.querySelector(".slot-symbol").textContent = "?";
      this.basePick.querySelector(".slot-symbol").textContent = "?";
      return;
    }
    this.playerPick.querySelector(".slot-symbol").textContent = this.lastPlayerPick
      ? choiceSymbol(this.lastPlayerPick)
      : "?";
    this.basePick.querySelector(".slot-symbol").textContent = this.lastResult?.baseChoice
      ? choiceSymbol(this.lastResult.baseChoice)
      : "?";
  }

  renderPlayers() {
    this.playerGrid.innerHTML = "";
    const human = this.human();
    const hidePublicMayor = human?.alive
      && human.id === this.revolutionaryId
      && !this.revolutionPowerUsed
      && this.anonymousMayorId === null;
    const showPublicMayorBadge = !hidePublicMayor && this.anonymousMayorId === null && !this.mayorSystemGone;
    this.players.forEach((player) => {
      const div = document.createElement("article");
      const showMayor = showPublicMayorBadge && player.id === this.mayorId && player.alive && this.alivePlayers().length > 2;
      const revealJob = !human?.alive || this.phase === "over";
      const loveDeath = this.loveDeathIds.includes(player.id);
      div.className = `player-card ${player.alive ? "" : "out"} ${showMayor ? "mayor" : ""} ${loveDeath ? "love-death" : ""}`;
      if (!player.alive) div.dataset.outLabel = loveDeath ? "애인 탈락" : "탈락";
      const pick = this.shouldHideRoundPicksFromHuman() ? "?" : player.pick ? choiceSymbol(player.pick) : "·";
      const courtBadge = player.id === this.defendantId && player.alive
        ? '<span class="mayor-badge court-badge">피고</span>'
        : "";
      const verdictBadge = this.guiltyIds.includes(player.id)
        ? '<span class="mayor-badge guilty-badge">유죄</span>'
        : this.innocentIds.includes(player.id)
          ? '<span class="mayor-badge innocent-badge">무죄</span>'
          : "";
      div.innerHTML = `
        <div class="player-top">
          <span class="player-name">${this.escape(player.name)}</span>
          ${showMayor ? '<span class="mayor-badge">시장</span>' : ""}
          ${courtBadge}
          ${verdictBadge}
          <span class="player-pick">${pick}</span>
        </div>
        <div class="player-state">
          <span>${player.alive ? "생존" : "탈락"} · ${this.playerTypeText(player)}</span>
          <span>${this.phase === "voting" && player.vote !== null ? `투표: ${this.playerById(player.vote).name}` : ""}</span>
        </div>
        ${revealJob ? `<div class="job-reveal">직업: ${this.revealedJobText(player)}</div>` : ""}
      `;
      this.playerGrid.append(div);
    });
  }

  shouldHideRoundPicksFromHuman() {
    const human = this.human();
    return human?.alive && human.id === this.shamanId && this.phase === "fateSwap";
  }

  revealedJobText(player) {
    if (player.id === this.revolutionaryId && !this.revolutionPowerUsed) return "혁명가";
    if (player.id === this.maestroId) return "마에스트로";
    if (player.id === this.shamanId && !this.shamanSpent) return "주술사";
    if (player.id === this.cupidId) return "큐피트";
    if (player.id === this.sheriffId) return "보안관";
    if (player.id === this.clownId) return this.clownIsJoker ? "조커" : "삐에로";
    if (player.id === this.judgeId) return "판사";
    if (player.id === this.prosecutorId) return "검사";
    if (player.id === this.defenderId) return "변호사";
    if (this.assassinIds.includes(player.id)) return "암살자";
    return "일반 플레이어";
  }

  renderFriends() {
    this.friendList.innerHTML = "";
    if (!this.friends.length) {
      const empty = document.createElement("div");
      empty.className = "friend-empty";
      empty.textContent = "아직 추가된 친구가 없습니다.";
      this.friendList.append(empty);
      return;
    }

    this.friends.forEach((friend, index) => {
      const invited = this.players.some((player) => player.name.toLowerCase() === friend.toLowerCase());
      const canInvite = this.phase === "waiting" && !invited && !this.lobbyFull();
      const row = document.createElement("div");
      row.className = "friend-row";
      row.innerHTML = `
        <div>
          <span class="friend-name">${this.escape(friend)}</span>
          <span class="friend-status">${invited ? "로비 참가 중" : "초대 가능"}</span>
        </div>
        <button type="button" class="friend-invite" ${canInvite ? "" : "disabled"}>${invited ? "참가" : "초대"}</button>
        <button type="button" class="friend-remove" aria-label="${this.escape(friend)} 삭제">×</button>
      `;
      row.querySelector(".friend-invite").addEventListener("click", () => this.inviteFriend(friend));
      row.querySelector(".friend-remove").addEventListener("click", () => this.removeFriend(index));
      this.friendList.append(row);
    });
  }

  playerTypeText(player) {
    if (player.type === "ai") return "AI";
    if (player.type === "friend") return "친구";
    return "플레이어";
  }

  renderLogs() {
    this.logList.innerHTML = "";
    this.logs.forEach((entry) => {
      const div = document.createElement("div");
      div.className = `log-entry ${entry.important ? "important" : ""}`;
      div.textContent = this.visibleLogMessage(entry.message);
      this.logList.append(div);
    });
  }

  visibleLogMessage(message) {
    const human = this.human();
    if (human?.alive && human.id === this.revolutionaryId && !this.revolutionPowerUsed) {
      return message
        .replace(/새 시장은 .+?입니다\./g, "새 시장이 선출되었습니다.")
        .replace(/시장 투표 결과: .+/g, "시장 투표가 종료되었습니다.");
    }
    return message;
  }

  phaseText() {
    return {
      waiting: "대기",
      voting: "시장 투표",
      candidateBlock: "후보 제외",
      successorSelect: "후계자 지정",
      edictSelect: "최후의 칙령",
      fateSwap: "운명 교환",
      deathSentence: "사망 선고",
      cupidSelect: "애인 지정",
      courtSelect: "피고 지정",
      resistance: "최면 저항전",
      choosing: "선택",
      reveal: "공개",
      over: "종료",
    }[this.phase] || "진행";
  }

  escape(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;",
    }[char]));
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.survivalGame = new SurvivalGame();
});
