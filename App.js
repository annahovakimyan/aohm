import { createContext, memo, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  Vibration,
  View,
  useColorScheme,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { createAudioPlayer, useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts } from "expo-font";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Stop, SvgXml } from "react-native-svg";
import Slider from "@react-native-community/slider";

// ---------- Colors ----------
const LIGHT = {
  lagoon: "#238F91",
  teal: "#38B6AC",
  aqua: "#A8DCD7",
  mist: "#E8F7F4",
  cloud: "#FAFCFB",
  slate: "#244C50",
  sage: "#91B8AD",
  sand: "#F2EDE5",
  muted: "#587A78",
  line: "#D5E8E4",
  empty: "#F0F3F2",
  white: "#FFFFFF",
  card: "#FFFFFF",
  soft: "#F1F8F6",
  link: "#238F91",
  heroText: "#4E6A68",
  glass: "rgba(255,255,255,0.85)",
  backdrop: "rgba(36,76,80,0.35)",
  moodTile: "#F7F6F1",
};

const DARK = {
  lagoon: "#238F91",
  teal: "#38B6AC",
  aqua: "#24504F",
  mist: "#172728",
  cloud: "#0E1718",
  slate: "#E2EEEB",
  sage: "#6F948A",
  sand: "#2A251C",
  muted: "#94ADA9",
  line: "#253839",
  empty: "#1A2A2B",
  white: "#FFFFFF",
  card: "#132122",
  soft: "#152526",
  link: "#4FC4B9",
  heroText: "#B9CCC8",
  glass: "rgba(19,33,34,0.8)",
  backdrop: "rgba(0,0,0,0.55)",
  moodTile: "#E9ECE6",
};

// The splash screen always uses the light colors.
const C = LIGHT;

const F = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

// ---------- Content ----------
const RHYTHMS = {
  calm: { steps: [["in", 4], ["out", 6]] },
  clear: { steps: [["in", 4], ["hold", 2], ["out", 4]] },
  release: { steps: [["in", 4], ["hold", 2], ["out", 6]] },
  even: { steps: [["in", 4], ["out", 4]] },
  box: { steps: [["in", 4], ["hold", 4], ["out", 4], ["hold", 4]] },
  sleep: { steps: [["in", 4], ["hold", 7], ["out", 8]] },
  free: { steps: null },
};

// Safe lookup: an unknown or missing breathing style falls back to Calm instead of crashing.
function rhythmSteps(key) {
  return (RHYTHMS[key] || RHYTHMS.calm).steps;
}

// Repairs a saved session from an older version of the app so it always has valid settings.
function cleanConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return null;
  return {
    ...cfg,
    id: cfg.id || "custom",
    rhythm: RHYTHMS[cfg.rhythm] ? cfg.rhythm : "calm",
    duration: typeof cfg.duration === "number" && cfg.duration >= 0 ? cfg.duration : 5,
    sound: cfg.sound || "none",
  };
}

const SOUND_KEYS = ["none", "rain", "nature", "forest", "brown", "birds", "ocean", "hum", "omm", "gong"];

// Healing Sounds on Home: sound-only sessions with no breathing guide.
const HEALING = ["omm", "brown", "gong", "rain", "ocean", "forest", "nature", "birds", "hum"];
const HEALING_MINUTES = 20;

function soundConfig(soundKey) {
  return { id: "sound", duration: HEALING_MINUTES, rhythm: "free", sound: soundKey };
}

// 0 means endless: breathe until you choose to stop.
const DURATIONS = [1, 2, 3, 5, 7, 10, 15, 20, 0];

const PRESETS = [
  { id: "calm", duration: 5, rhythm: "calm", sound: "rain", icon: "heart", bg: "#E8F7F4", bgDark: "#14292A" },
  { id: "clear", duration: 5, rhythm: "clear", sound: "nature", icon: "target", bg: "#E4F0F1", bgDark: "#14262A" },
  { id: "stress", duration: 7, rhythm: "release", sound: "forest", icon: "leaf", bg: "#E8F3EA", bgDark: "#172A20" },
  { id: "sleep", duration: 10, rhythm: "release", sound: "brown", icon: "moon", bg: "#E9E9F3", bgDark: "#1C1F2E" },
  { id: "morning", duration: 5, rhythm: "even", sound: "birds", icon: "sun", bg: "#F2EDE5", bgDark: "#2A251C" },
  { id: "quick", duration: 1, rhythm: "calm", sound: "ocean", icon: "waves", bg: "#E5F2F0", bgDark: "#13282A" },
];

const MOODS = ["calm", "anxious", "stressed", "tired", "overwhelmed", "good"];
const MOOD_IMAGES = {
  calm: require("./assets/images/moods/calm.png"),
  anxious: require("./assets/images/moods/anxious.png"),
  stressed: require("./assets/images/moods/stressed.png"),
  tired: require("./assets/images/moods/tired.png"),
  overwhelmed: require("./assets/images/moods/overwhelmed.png"),
  good: require("./assets/images/moods/good.png"),
};

function timeOfDay(hour) {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}

// Which exercise to suggest, based on the feeling picked on Home and the time of day.
function recommend(mood, hour) {
  const night = hour >= 20 || hour < 5;
  const morning = hour >= 5 && hour < 11;
  switch (mood) {
    case "anxious": return "calm";
    case "stressed": return "stress";
    case "overwhelmed": return "quick";
    case "tired": return night ? "sleep" : "morning";
    case "calm": return night ? "sleep" : "clear";
    case "good": return night ? "sleep" : morning ? "morning" : "clear";
    default: return night ? "sleep" : morning ? "morning" : hour < 17 ? "clear" : "calm";
  }
}

function presetConfig(p) {
  return { id: p.id, duration: p.duration, rhythm: p.rhythm, sound: p.sound };
}

function customConfig(draft) {
  return { id: "custom", duration: draft.duration, rhythm: draft.rhythm, sound: draft.sound };
}

const FIRST_SESSION = presetConfig(PRESETS[0]);

function sameConfig(a, b) {
  return !!a && !!b && a.id === b.id && a.duration === b.duration && a.rhythm === b.rhythm && a.sound === b.sound;
}

// ---------- Languages ----------
// To change any text in the app, edit it here. Each language has the same keys.
const LANGUAGES = [
  { code: "hy", name: "Հայերեն" },
  { code: "ru", name: "Русский" },
  { code: "en", name: "English" },
];

function ruPlural(n, one, few, many) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

function enPlural(n, one, other) {
  return n === 1 ? one : other;
}

const STRINGS = {
  en: {
    "badge.default": "Default",
    min: ({ n }) => `${n} min`,
    "custom.title": "Create your own session",
    "custom.sub": "Duration · Breathing style · Sounds",
    "custom.yourDefault": ({ summary }) => `Your default: ${summary}`,
    "custom.name": "Your session",

    "preset.calm.name": "Slow down",
    "preset.calm.sub": "Settle into peace",
    "preset.calm.tag": "Settle into peace",
    "preset.clear.name": "Clear your mind",
    "preset.clear.sub": "Clear mental space",
    "preset.clear.tag": "Clear mental space",
    "preset.stress.name": "Let It Go",
    "preset.stress.sub": "Release tension",
    "preset.stress.tag": "Release tension",
    "preset.sleep.name": "Drift to Sleep",
    "preset.sleep.sub": "Ease into sleep",
    "preset.sleep.tag": "Ease into sleep",
    "preset.morning.name": "Awaken",
    "preset.morning.sub": "Start fresh",
    "preset.morning.tag": "Start fresh",
    "preset.quick.name": "Quick reset",
    "preset.quick.sub": "A brief pause",
    "preset.quick.tag": "A brief pause",

    "rhythm.calm": "Calm",
    "rhythm.even": "Even",
    "rhythm.box": "Box",
    "rhythm.sleep": "4·7·8",
    "rhythm.free": "Natural",
    "rhythm.free.detail": "Breathe at your own pace",
    "rhythm.step": ({ phase, n }) => `${n}s ${phase}`,
    "step.in": "in",
    "step.out": "out",
    "step.hold": "hold",

    "sound.none": "Silence",
    "sound.rain": "Soft rain",
    "sound.nature": "Nature",
    "sound.forest": "Forest",
    "sound.brown": "Brown noise",
    "sound.birds": "Birds",
    "sound.ocean": "Ocean",
    "sound.hum": "Soft hum",

    "phase.in": "Breathe in",
    "phase.out": "Breathe out",
    "phase.hold": "Hold",
    "phase.free": "Breathe freely",
    "phase.freeDetail": "Your own pace",
    "phase.paused": "Paused",
    seconds: ({ n }) => `${n} ${enPlural(n, "second", "seconds")}`,

    "btn.start": "Start session",
    "btn.pause": "Pause",
    "btn.resume": "Resume",
    "btn.end": "End",
    "btn.setDefault": "Set as default",
    "btn.saveDefault": "Save as default",
    "omm.useDefault": ({ name }) => `Use my default: ${name}`,
    "note.restored": "Your session was paused. Resume when you're ready.",
    "note.ended": "Session ended. Only finished sessions count toward your progress.",
    "done.title": "Well done",

    "progress.title": "Your Rhythm",
    streak: ({ n }) => `${n} day streak`,
    "progress.noStreak": "Start your streak today",
    "progress.every": "Every moment of mindfulness counts.",
    "progress.month": ({ n }) => `${n} ${enPlural(n, "day", "days")} practiced this month`,
    sessions: ({ n }) => `${n} ${enPlural(n, "session", "sessions")}`,
    minutes: ({ n }) => `${n} ${enPlural(n, "minute", "minutes")}`,
    "progress.week": "7 days",
    "progress.monthTab": "Month",
    "progress.last7": "Last 7 days",
    "progress.completed": "Completed",
    "progress.notCompleted": "Not completed",
    "progress.prevMonth": "Previous month",
    "progress.nextMonth": "Next month",
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    weekdays: ["S", "M", "T", "W", "T", "F", "S"],
    weekStart: 0,

    "prefs.bell": "Bell at start and end",
    "prefs.haptics": "Breathing vibrations",
    "prefs.motion": "Reduce motion",
    "prefs.language": "Language",

    "sheet.length": "Length",
    "sheet.breathing": "Breathing",
    "sheet.sound": "Sound",
    "sheet.isDefault": "This is your default session",
    "sheet.close": "Close",
    "builder.sub": "Pick what feels right. Save it as your default to find it on the Omm tab.",
    "builder.duration": "Duration",
    "builder.style": "Breathing style",
    "builder.saved": "Saved as your default",

    "home.sounds": "Healing Sounds",
    "home.seeAll": "See all",
    "home.play": ({ name }) => `Play ${name}`,
    "sound.omm": "Omm chant",
    "soundDesc.omm": "Deep chanting to center yourself",
    "soundDesc.brown": "Deep, steady calm",
    "soundDesc.rain": "Gentle rainfall",
    "soundDesc.ocean": "Slow rolling waves",
    "soundDesc.forest": "Wind through the trees",
    "soundDesc.nature": "A quiet stream",
    "soundDesc.birds": "Morning birdsong",
    "soundDesc.hum": "A soft, warm tone",
    "sound.gong": "Gong",
    "soundDesc.gong": "Deep, resonant waves",
    "soundDesc.none": "Quiet time",
    "settings.title": "Settings",
    "prefs.welcome": "Omm sound when opening the app",
    "rhythm.clear": "4·2·4",
    "rhythm.release": "4·2·6",
    "greet.morning": "Good morning",
    "greet.afternoon": "Good afternoon",
    "greet.evening": "Good evening",
    "home.subtitle": "Take a breath. You've got this.",
    "home.notNow": "Not now",
    "home.feeling": "How are you feeling right now?",
    "home.recommended": "Recommended for you",
    "home.basedOnFeeling": "Based on how you're feeling",
    "home.allSessions": "All sessions",
    "mood.calm": "Calm",
    "mood.anxious": "Anxious",
    "mood.stressed": "Stressed",
    "mood.tired": "Tired",
    "mood.overwhelmed": "Overwhelmed",
    "mood.good": "Good",
    "mood.question": "How do you feel now?",
    "mood.notice": "Notice any change, however small.",
    "mood.skip": "Skip",
    "mood.thanks": "Thanks for checking in.",
    "done.subtitle": "You took a moment for yourself.",
    "done.minutesLabel": "Minutes",
    "done.bpm": "Breaths per minute",
    "btn.backHome": "Back to home",
    "btn.yourRhythm": "See your rhythm",
    "rhythm.feelingTitle": "How you've been feeling",
    "rhythm.noFeelings": "Check in after a session to see how you've been feeling.",
    endless: "Endless",
    "prefs.ambientVolume": "Background sound volume",
    "tab.home": "Home",
    "tab.omm": "Breathe",
    "tab.progress": "Your Rhythm",
    "tab.ommLive": "Breathe, session in progress",

    "notif.title": "Session complete",
    "notif.body": ({ name }) => `${name} is done. Well done.`,
  },

  ru: {
    "badge.default": "Основная",
    min: ({ n }) => `${n} мин`,
    "custom.title": "Создайте свою сессию",
    "custom.sub": "Длительность · Дыхание · Звуки",
    "custom.yourDefault": ({ summary }) => `Ваша основная: ${summary}`,
    "custom.name": "Ваша сессия",

    "preset.calm.name": "Замедлиться",
    "preset.calm.sub": "Погрузиться в покой",
    "preset.calm.tag": "Погрузиться в покой",
    "preset.clear.name": "Очистить разум",
    "preset.clear.sub": "Ясность для мыслей",
    "preset.clear.tag": "Ясность для мыслей",
    "preset.stress.name": "Отпустить",
    "preset.stress.sub": "Снять напряжение",
    "preset.stress.tag": "Снять напряжение",
    "preset.sleep.name": "Погрузиться в сон",
    "preset.sleep.sub": "Мягко уснуть",
    "preset.sleep.tag": "Мягко уснуть",
    "preset.morning.name": "Пробуждение",
    "preset.morning.sub": "Начать день свежим",
    "preset.morning.tag": "Начать день свежим",
    "preset.quick.name": "Быстрая перезагрузка",
    "preset.quick.sub": "Короткая пауза",
    "preset.quick.tag": "Короткая пауза",

    "rhythm.calm": "Спокойное",
    "rhythm.even": "Ровное",
    "rhythm.box": "Квадрат",
    "rhythm.sleep": "4·7·8",
    "rhythm.free": "Естественное",
    "rhythm.free.detail": "Дышите в своём темпе",
    "rhythm.step": ({ phase, n }) => `${phase} ${n} с`,
    "step.in": "вдох",
    "step.out": "выдох",
    "step.hold": "пауза",

    "sound.none": "Тишина",
    "sound.rain": "Тихий дождь",
    "sound.nature": "Природа",
    "sound.forest": "Лес",
    "sound.brown": "Коричневый шум",
    "sound.birds": "Птицы",
    "sound.ocean": "Океан",
    "sound.hum": "Мягкий гул",

    "phase.in": "Вдох",
    "phase.out": "Выдох",
    "phase.hold": "Задержка",
    "phase.free": "Дышите свободно",
    "phase.freeDetail": "В своём темпе",
    "phase.paused": "Пауза",
    seconds: ({ n }) => `${n} ${ruPlural(n, "секунда", "секунды", "секунд")}`,

    "btn.start": "Начать сессию",
    "btn.pause": "Пауза",
    "btn.resume": "Продолжить",
    "btn.end": "Завершить",
    "btn.setDefault": "Сделать основной",
    "btn.saveDefault": "Сохранить как основную",
    "omm.useDefault": ({ name }) => `Выбрать основную: ${name}`,
    "note.restored": "Сессия на паузе. Продолжите, когда будете готовы.",
    "note.ended": "Сессия завершена. В прогрессе учитываются только завершённые сессии.",
    "done.title": "Отлично",

    "progress.title": "Ваш ритм",
    streak: ({ n }) => `${n} ${ruPlural(n, "день", "дня", "дней")} подряд`,
    "progress.noStreak": "Начните серию сегодня",
    "progress.every": "Каждый момент осознанности важен.",
    "progress.month": ({ n }) => `${n} ${ruPlural(n, "день", "дня", "дней")} практики в этом месяце`,
    sessions: ({ n }) => `${n} ${ruPlural(n, "сессия", "сессии", "сессий")}`,
    minutes: ({ n }) => `${n} ${ruPlural(n, "минута", "минуты", "минут")}`,
    "progress.week": "7 дней",
    "progress.monthTab": "Месяц",
    "progress.last7": "Последние 7 дней",
    "progress.completed": "Выполнено",
    "progress.notCompleted": "Не выполнено",
    "progress.prevMonth": "Предыдущий месяц",
    "progress.nextMonth": "Следующий месяц",
    months: ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"],
    weekdays: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
    weekStart: 1,

    "prefs.bell": "Колокол в начале и в конце",
    "prefs.haptics": "Вибрация при дыхании",
    "prefs.motion": "Уменьшить движение",
    "prefs.language": "Язык",

    "sheet.length": "Длительность",
    "sheet.breathing": "Дыхание",
    "sheet.sound": "Звук",
    "sheet.isDefault": "Это ваша основная сессия",
    "sheet.close": "Закрыть",
    "builder.sub": "Выберите то, что вам подходит. Сохраните как основную, и она появится во вкладке Omm.",
    "builder.duration": "Длительность",
    "builder.style": "Тип дыхания",
    "builder.saved": "Сохранено как основная",

    "home.sounds": "Звуки для покоя",
    "home.seeAll": "Все",
    "home.play": ({ name }) => `Включить: ${name}`,
    "sound.omm": "Мантра Омм",
    "soundDesc.omm": "Глубокое пение для внутреннего равновесия",
    "soundDesc.brown": "Глубокое, ровное спокойствие",
    "soundDesc.rain": "Мягкий шум дождя",
    "soundDesc.ocean": "Неспешные волны",
    "soundDesc.forest": "Ветер в деревьях",
    "soundDesc.nature": "Тихий ручей",
    "soundDesc.birds": "Утреннее пение птиц",
    "soundDesc.hum": "Мягкий тёплый тон",
    "sound.gong": "Гонг",
    "soundDesc.gong": "Глубокие звучные волны",
    "soundDesc.none": "Время тишины",
    "settings.title": "Настройки",
    "prefs.welcome": "Звук Омм при открытии приложения",
    "rhythm.clear": "4·2·4",
    "rhythm.release": "4·2·6",
    "greet.morning": "Доброе утро",
    "greet.afternoon": "Добрый день",
    "greet.evening": "Добрый вечер",
    "home.subtitle": "Сделайте вдох. У вас всё получится.",
    "home.notNow": "Не сейчас",
    "home.feeling": "Как вы себя чувствуете сейчас?",
    "home.recommended": "Рекомендуем вам",
    "home.basedOnFeeling": "С учётом вашего самочувствия",
    "home.allSessions": "Все упражнения",
    "mood.calm": "Спокойствие",
    "mood.anxious": "Тревога",
    "mood.stressed": "Стресс",
    "mood.tired": "Усталость",
    "mood.overwhelmed": "Перегруз",
    "mood.good": "Хорошо",
    "mood.question": "Как вы себя чувствуете теперь?",
    "mood.notice": "Заметьте любую перемену, даже небольшую.",
    "mood.skip": "Пропустить",
    "mood.thanks": "Спасибо, что отметили.",
    "done.subtitle": "Вы уделили время себе.",
    "done.minutesLabel": "Минуты",
    "done.bpm": "Вдохов в минуту",
    "btn.backHome": "На главную",
    "btn.yourRhythm": "Ваш ритм",
    "rhythm.feelingTitle": "Ваше самочувствие",
    "rhythm.noFeelings": "Отмечайте самочувствие после сессий, и оно появится здесь.",
    endless: "Без ограничений",
    "prefs.ambientVolume": "Громкость фоновых звуков",
    "tab.home": "Главная",
    "tab.omm": "Дыхание",
    "tab.progress": "Ваш ритм",
    "tab.ommLive": "Дыхание, идёт сессия",

    "notif.title": "Сессия завершена",
    "notif.body": ({ name }) => `${name}: готово. Отлично!`,
  },

  hy: {
    "badge.default": "Հիմնական",
    min: ({ n }) => `${n} րոպե`,
    "custom.title": "Ստեղծեք ձեր պարապմունքը",
    "custom.sub": "Տևողություն · Շնչառություն · Ձայներ",
    "custom.yourDefault": ({ summary }) => `Ձեր հիմնականը՝ ${summary}`,
    "custom.name": "Ձեր պարապմունքը",

    "preset.calm.name": "Դանդաղեցնել",
    "preset.calm.sub": "Ընկղմվել խաղաղության մեջ",
    "preset.calm.tag": "Ընկղմվել խաղաղության մեջ",
    "preset.clear.name": "Մաքրել միտքը",
    "preset.clear.sub": "Տեղ հստակ մտքերի համար",
    "preset.clear.tag": "Տեղ հստակ մտքերի համար",
    "preset.stress.name": "Բաց թողնել",
    "preset.stress.sub": "Թոթափել լարվածությունը",
    "preset.stress.tag": "Թոթափել լարվածությունը",
    "preset.sleep.name": "Պատրաստվել քնին",
    "preset.sleep.sub": "Մեղմորեն ընկղմվել քնի մեջ",
    "preset.sleep.tag": "Մեղմորեն ընկղմվել քնի մեջ",
    "preset.morning.name": "Արթնացում",
    "preset.morning.sub": "Թարմ սկիզբ",
    "preset.morning.tag": "Թարմ սկիզբ",
    "preset.quick.name": "Արագ վերականգնում",
    "preset.quick.sub": "Կարճ դադար",
    "preset.quick.tag": "Կարճ դադար",

    "rhythm.calm": "Հանգիստ",
    "rhythm.even": "Հավասար",
    "rhythm.box": "Քառակուսի",
    "rhythm.sleep": "4·7·8",
    "rhythm.free": "Բնական",
    "rhythm.free.detail": "Շնչեք ձեր ռիթմով",
    "rhythm.step": ({ phase, n }) => `${phase} ${n} վ`,
    "step.in": "ներշնչում",
    "step.out": "արտաշնչում",
    "step.hold": "դադար",

    "sound.none": "Լռություն",
    "sound.rain": "Մեղմ անձրև",
    "sound.nature": "Բնություն",
    "sound.forest": "Անտառ",
    "sound.brown": "Շագանակագույն աղմուկ",
    "sound.birds": "Թռչուններ",
    "sound.ocean": "Օվկիանոս",
    "sound.hum": "Մեղմ բզզոց",

    "phase.in": "Ներշնչեք",
    "phase.out": "Արտաշնչեք",
    "phase.hold": "Պահեք",
    "phase.free": "Շնչեք ազատ",
    "phase.freeDetail": "Ձեր ռիթմով",
    "phase.paused": "Դադար",
    seconds: ({ n }) => `${n} վայրկյան`,

    "btn.start": "Սկսել պարապմունքը",
    "btn.pause": "Դադար",
    "btn.resume": "Շարունակել",
    "btn.end": "Ավարտել",
    "btn.setDefault": "Դարձնել հիմնական",
    "btn.saveDefault": "Պահել որպես հիմնական",
    "omm.useDefault": ({ name }) => `Ընտրել հիմնականը՝ ${name}`,
    "note.restored": "Պարապմունքը դադարեցված է։ Շարունակեք, երբ պատրաստ լինեք։",
    "note.ended": "Պարապմունքն ավարտվեց։ Առաջընթացում հաշվվում են միայն ավարտին հասցված պարապմունքները։",
    "done.title": "Հիանալի է",

    "progress.title": "Ձեր ռիթմը",
    streak: ({ n }) => `${n} օր անընդմեջ`,
    "progress.noStreak": "Սկսեք ձեր շարքն այսօր",
    "progress.every": "Գիտակցվածության յուրաքանչյուր պահ կարևոր է։",
    "progress.month": ({ n }) => `${n} օր պարապմունք այս ամիս`,
    sessions: ({ n }) => `${n} պարապմունք`,
    minutes: ({ n }) => `${n} րոպե`,
    "progress.week": "7 օր",
    "progress.monthTab": "Ամիս",
    "progress.last7": "Վերջին 7 օրը",
    "progress.completed": "Կատարված",
    "progress.notCompleted": "Չկատարված",
    "progress.prevMonth": "Նախորդ ամիս",
    "progress.nextMonth": "Հաջորդ ամիս",
    months: ["Հունվար", "Փետրվար", "Մարտ", "Ապրիլ", "Մայիս", "Հունիս", "Հուլիս", "Օգոստոս", "Սեպտեմբեր", "Հոկտեմբեր", "Նոյեմբեր", "Դեկտեմբեր"],
    weekdays: ["Կիր", "Երկ", "Երք", "Չրք", "Հնգ", "Ուր", "Շբթ"],
    weekStart: 1,

    "prefs.bell": "Զանգ սկզբում և վերջում",
    "prefs.haptics": "Շնչառության թրթռում",
    "prefs.motion": "Նվազեցնել շարժումը",
    "prefs.language": "Լեզու",

    "sheet.length": "Տևողություն",
    "sheet.breathing": "Շնչառություն",
    "sheet.sound": "Ձայն",
    "sheet.isDefault": "Սա ձեր հիմնական պարապմունքն է",
    "sheet.close": "Փակել",
    "builder.sub": "Ընտրեք այն, ինչ ձեզ հարմար է։ Պահեք որպես հիմնական, և այն կհայտնվի Omm բաժնում։",
    "builder.duration": "Տևողություն",
    "builder.style": "Շնչառության տեսակ",
    "builder.saved": "Պահված է որպես հիմնական",

    "home.sounds": "Հանգստացնող ձայներ",
    "home.seeAll": "Բոլորը",
    "home.play": ({ name }) => `Միացնել՝ ${name}`,
    "sound.omm": "Omm մանտրա",
    "soundDesc.omm": "Խորը երգեցողություն՝ ներքին հավասարակշռության համար",
    "soundDesc.brown": "Խորը, կայուն հանգստություն",
    "soundDesc.rain": "Անձրևի մեղմ ձայն",
    "soundDesc.ocean": "Դանդաղ ալիքներ",
    "soundDesc.forest": "Քամին ծառերի մեջ",
    "soundDesc.nature": "Խաղաղ առվակ",
    "soundDesc.birds": "Թռչունների առավոտյան երգ",
    "soundDesc.hum": "Մեղմ, ջերմ տոն",
    "sound.gong": "Գոնգ",
    "soundDesc.gong": "Խորը, հնչեղ ալիքներ",
    "soundDesc.none": "Լռության պահ",
    "settings.title": "Կարգավորումներ",
    "prefs.welcome": "Omm ձայնը հավելվածը բացելիս",
    "rhythm.clear": "4·2·4",
    "rhythm.release": "4·2·6",
    "greet.morning": "Բարի լույս",
    "greet.afternoon": "Բարի օր",
    "greet.evening": "Բարի երեկո",
    "home.subtitle": "Խորը շունչ քաշեք։ Դուք կկարողանաք։",
    "home.notNow": "Ոչ հիմա",
    "home.feeling": "Ինչպե՞ս եք ձեզ զգում հիմա։",
    "home.recommended": "Առաջարկում ենք ձեզ",
    "home.basedOnFeeling": "Ըստ ձեր տրամադրության",
    "home.allSessions": "Բոլոր վարժությունները",
    "mood.calm": "Հանգիստ",
    "mood.anxious": "Անհանգիստ",
    "mood.stressed": "Սթրես",
    "mood.tired": "Հոգնած",
    "mood.overwhelmed": "Ծանրաբեռնված",
    "mood.good": "Լավ",
    "mood.question": "Իսկ հիմա ինչպե՞ս եք ձեզ զգում։",
    "mood.notice": "Նկատեք ցանկացած փոփոխություն, անգամ փոքր։",
    "mood.skip": "Բաց թողնել",
    "mood.thanks": "Շնորհակալություն, որ նշեցիք։",
    "done.subtitle": "Դուք ժամանակ տրամադրեցիք ինքներդ ձեզ։",
    "done.minutesLabel": "Րոպե",
    "done.bpm": "Շունչ րոպեում",
    "btn.backHome": "Գլխավոր էջ",
    "btn.yourRhythm": "Ձեր ռիթմը",
    "rhythm.feelingTitle": "Ինչպես եք ձեզ զգացել",
    "rhythm.noFeelings": "Նշեք ձեր տրամադրությունը պարապմունքից հետո, և այն կհայտնվի այստեղ։",
    endless: "Անսահմանափակ",
    "prefs.ambientVolume": "Ֆոնային ձայների բարձրություն",
    "tab.home": "Գլխավոր",
    "tab.omm": "Շնչառություն",
    "tab.progress": "Ձեր ռիթմը",
    "tab.ommLive": "Շնչառություն, պարապմունքն ընթացքում է",

    "notif.title": "Պարապմունքն ավարտված է",
    "notif.body": ({ name }) => `${name}՝ ավարտված է։ Հիանալի է։`,
  },
};

function makeT(lang) {
  const dict = STRINGS[lang] || STRINGS.en;
  return (key, vars = {}) => {
    const v = dict[key] !== undefined ? dict[key] : STRINGS.en[key];
    if (v === undefined) return key;
    return typeof v === "function" ? v(vars) : v;
  };
}

function detectLanguage() {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || "";
    if (locale.startsWith("hy")) return "hy";
    if (locale.startsWith("ru")) return "ru";
  } catch (_) {}
  return "en";
}

const I18n = createContext(makeT("en"));
const useT = () => useContext(I18n);

function sessionName(config, t) {
  if (config.id === "custom") return t("custom.name");
  if (config.id === "sound") return t(`sound.${config.sound}`);
  return t(`preset.${config.id}.name`);
}

function rhythmDetail(key, t) {
  const steps = rhythmSteps(key);
  if (!steps) return t("rhythm.free.detail");
  return steps.map(([k, n]) => t("rhythm.step", { phase: t(`step.${k}`), n })).join(" · ");
}

function paceText(key, t) {
  const steps = rhythmSteps(key);
  if (!steps) return t("rhythm.free.detail");
  return steps.map(([, n]) => n).join(" · ");
}

function durationLabel(n, t) {
  return n === 0 ? t("endless") : t("min", { n });
}

function phaseText(phase, t) {
  if (!phase || !phase.key) return { label: "", detail: "" };
  if (phase.key === "paused") return { label: t("phase.paused"), detail: "" };
  if (phase.key === "free") return { label: t("phase.free"), detail: t("phase.freeDetail") };
  return { label: t(`phase.${phase.key}`), detail: t("seconds", { n: phase.len }) };
}

// ---------- Artwork ----------
// Drawn in code so the app needs no image files. You can swap these for photos later.
const HERO_XML = "<svg preserveAspectRatio=\"xMidYMid slice\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 390 300\"> <defs> <linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#E9EEEC\"/><stop offset=\"0.55\" stop-color=\"#F5EEE2\"/><stop offset=\"1\" stop-color=\"#EDEFEA\"/></linearGradient> <radialGradient id=\"sun\" cx=\"0.5\" cy=\"0.5\" r=\"0.5\"><stop offset=\"0\" stop-color=\"#FFF7E2\" stop-opacity=\"1\"/><stop offset=\"0.25\" stop-color=\"#FCE9C4\" stop-opacity=\"0.8\"/><stop offset=\"1\" stop-color=\"#F7E3C0\" stop-opacity=\"0\"/></radialGradient> <linearGradient id=\"mist\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#FAFCFB\" stop-opacity=\"0\"/><stop offset=\"1\" stop-color=\"#FAFCFB\" stop-opacity=\"0.9\"/></linearGradient> </defs> <rect fill=\"url(#sky)\"/> <circle cx=\"318\" cy=\"150\" r=\"110\" fill=\"url(#sun)\"/> <path d=\"M0 178 L38 160 L70 170 L112 138 L150 158 L196 126 L236 150 L268 134 L302 152 L346 128 L390 146 V300 H0Z\" fill=\"#D9E2E1\"/> <path d=\"M0 206 L46 184 L90 198 L138 168 L186 192 L232 172 L276 194 L324 170 L390 186 V300 H0Z\" fill=\"#BFCFCF\"/> <path d=\"M0 238 C52 220 96 234 146 222 C204 208 246 230 292 216 C330 205 362 212 390 206 V300 H0Z\" fill=\"#9DB4B3\"/> <path d=\"M250 300 C262 262 300 246 340 248 C368 249 384 256 390 260 V300Z\" fill=\"#7F928A\"/> <rect y=\"170\" width=\"390\" height=\"130\" fill=\"url(#mist)\"/> <path d=\"M350 262 C354 226 366 200 386 180\" stroke=\"#5F7D66\" stroke-width=\"1.6\" fill=\"none\" stroke-linecap=\"round\"/><g fill=\"#6E8C70\"><path d=\"M0 0 C4 -4 11 -4 15 0 C11 4 4 4 0 0Z\" transform=\"translate(356 236) rotate(-150)\"/><path d=\"M0 0 C4 -4 11 -4 15 0 C11 4 4 4 0 0Z\" transform=\"translate(360 224) rotate(-30)\"/><path d=\"M0 0 C4 -4 11 -4 15 0 C11 4 4 4 0 0Z\" transform=\"translate(363 212) rotate(-160)\"/><path d=\"M0 0 C4 -4 11 -4 15 0 C11 4 4 4 0 0Z\" transform=\"translate(368 202) rotate(-20)\"/><path d=\"M0 0 C4 -4 11 -4 15 0 C11 4 4 4 0 0Z\" transform=\"translate(372 194) rotate(-140)\"/><path d=\"M0 0 C4 -4 11 -4 15 0 C11 4 4 4 0 0Z\" transform=\"translate(377 186) rotate(-40)\"/><path d=\"M0 0 C4 -4 11 -4 15 0 C11 4 4 4 0 0Z\" transform=\"translate(381 182) rotate(-110)\"/><path d=\"M0 0 C4 -4 11 -4 15 0 C11 4 4 4 0 0Z\" transform=\"translate(354 246) rotate(-20)\"/><path d=\"M0 0 C4 -4 11 -4 15 0 C11 4 4 4 0 0Z\" transform=\"translate(366 218) rotate(-60)\"/></g> </svg> ";

const HERO_XML_DARK = HERO_XML.replace("#E9EEEC", "#0F1C1E").replace("#F5EEE2", "#18292B").replace("#EDEFEA", "#132122")
  .replace("#FFF7E2", "#DCE9E6").replace("#FCE9C4", "#9FB8B4").replace("#F7E3C0", "#5F7C79")
  .replace("#D9E2E1", "#1E3133").replace("#BFCFCF", "#192A2C").replace("#9DB4B3", "#142325").replace("#7F928A", "#0F1B1C")
  .replace(/#FAFCFB/g, "#0E1718").replace("#5F7D66", "#3C5A48").replace("#6E8C70", "#40604C");

const THUMBS = {
  gong: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 80 80\" preserveAspectRatio=\"xMidYMid slice\"><defs><linearGradient id=\"g_gong\" x1=\"0\" y1=\"0\" x2=\"0.4\" y2=\"1\"><stop offset=\"0\" stop-color=\"#E9D3A6\"/><stop offset=\"1\" stop-color=\"#B0874E\"/></linearGradient><radialGradient id=\"r_gong\" cx=\"0.45\" cy=\"0.4\" r=\"0.6\"><stop offset=\"0\" stop-color=\"#F4DDA8\"/><stop offset=\"1\" stop-color=\"#9C6E32\"/></radialGradient></defs><rect width=\"80\" height=\"80\" fill=\"url(#g_gong)\"/><path d=\"M14 12 H66\" stroke=\"#5C4026\" stroke-width=\"2.4\" stroke-linecap=\"round\"/><path d=\"M30 12 L33 22 M50 12 L47 22\" stroke=\"#5C4026\" stroke-width=\"1.4\"/><circle cx=\"40\" cy=\"44\" r=\"22\" fill=\"url(#r_gong)\"/><circle cx=\"40\" cy=\"44\" r=\"13\" fill=\"none\" stroke=\"#7A5328\" stroke-opacity=\"0.45\" stroke-width=\"1.2\"/><circle cx=\"40\" cy=\"44\" r=\"5\" fill=\"#7A5328\" fill-opacity=\"0.35\"/></svg>",
  omm: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 80 80\" preserveAspectRatio=\"xMidYMid slice\"><defs><linearGradient id=\"g_omm\" x1=\"0\" y1=\"0\" x2=\"0.4\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4FA9A8\"/><stop offset=\"1\" stop-color=\"#1E6E72\"/></linearGradient></defs><rect width=\"80\" height=\"80\" fill=\"url(#g_omm)\"/><ellipse cx=\"44\" cy=\"46\" rx=\"30\" ry=\"11\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.25\" stroke-width=\"1.2\"/><ellipse cx=\"44\" cy=\"46\" rx=\"19\" ry=\"7\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.4\" stroke-width=\"1.2\"/><ellipse cx=\"44\" cy=\"46\" rx=\"9\" ry=\"3.4\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.6\" stroke-width=\"1.2\"/><path d=\"M44 14 C46 20 47 23 44 26 C41 23 42 20 44 14Z\" fill=\"#FFFFFF\" fill-opacity=\"0.7\"/></svg>",
  brown: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 80 80\" preserveAspectRatio=\"xMidYMid slice\"><defs><linearGradient id=\"g_brown\" x1=\"0\" y1=\"0\" x2=\"0.4\" y2=\"1\"><stop offset=\"0\" stop-color=\"#9C7A5B\"/><stop offset=\"1\" stop-color=\"#5A4330\"/></linearGradient></defs><rect width=\"80\" height=\"80\" fill=\"url(#g_brown)\"/><path d=\"M-5 30 C15 22 35 34 55 26 C68 21 78 24 85 22\" fill=\"none\" stroke=\"#C9A685\" stroke-opacity=\"0.6\" stroke-width=\"2\"/><path d=\"M-5 46 C18 38 36 50 58 42 C70 38 79 40 85 38\" fill=\"none\" stroke=\"#C9A685\" stroke-opacity=\"0.5\" stroke-width=\"2\"/><path d=\"M-5 62 C20 54 38 66 60 58 C72 54 80 56 85 54\" fill=\"none\" stroke=\"#C9A685\" stroke-opacity=\"0.4\" stroke-width=\"2\"/></svg>",
  rain: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 80 80\" preserveAspectRatio=\"xMidYMid slice\"><defs><linearGradient id=\"g_rain\" x1=\"0\" y1=\"0\" x2=\"0.4\" y2=\"1\"><stop offset=\"0\" stop-color=\"#9DBCC4\"/><stop offset=\"1\" stop-color=\"#557C88\"/></linearGradient></defs><rect width=\"80\" height=\"80\" fill=\"url(#g_rain)\"/><g stroke=\"#FFFFFF\" stroke-opacity=\"0.6\" stroke-width=\"1.6\" stroke-linecap=\"round\"><path d=\"M14 10 l-4 10\"/><path d=\"M34 6 l-4 10\"/><path d=\"M56 12 l-4 10\"/><path d=\"M72 4 l-4 10\"/><path d=\"M22 32 l-4 10\"/><path d=\"M46 28 l-4 10\"/><path d=\"M66 34 l-4 10\"/><path d=\"M12 54 l-4 10\"/><path d=\"M36 52 l-4 10\"/><path d=\"M58 56 l-4 10\"/></g></svg>",
  ocean: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 80 80\" preserveAspectRatio=\"xMidYMid slice\"><defs><linearGradient id=\"g_ocean\" x1=\"0\" y1=\"0\" x2=\"0.4\" y2=\"1\"><stop offset=\"0\" stop-color=\"#8ED0CC\"/><stop offset=\"1\" stop-color=\"#2C7A86\"/></linearGradient></defs><rect width=\"80\" height=\"80\" fill=\"url(#g_ocean)\"/><g fill=\"none\" stroke=\"#FFFFFF\" stroke-linecap=\"round\" stroke-width=\"1.8\"><path d=\"M-4 34 c8 -6 16 -6 24 0 s16 6 24 0 16 -6 24 0 16 6 24 0\" stroke-opacity=\"0.45\"/><path d=\"M-4 48 c8 -6 16 -6 24 0 s16 6 24 0 16 -6 24 0 16 6 24 0\" stroke-opacity=\"0.6\"/><path d=\"M-4 62 c8 -6 16 -6 24 0 s16 6 24 0 16 -6 24 0 16 6 24 0\" stroke-opacity=\"0.75\"/></g></svg>",
  forest: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 80 80\" preserveAspectRatio=\"xMidYMid slice\"><defs><linearGradient id=\"g_forest\" x1=\"0\" y1=\"0\" x2=\"0.4\" y2=\"1\"><stop offset=\"0\" stop-color=\"#B5CDAE\"/><stop offset=\"1\" stop-color=\"#4C7052\"/></linearGradient></defs><rect width=\"80\" height=\"80\" fill=\"url(#g_forest)\"/><g fill=\"#2F5236\" fill-opacity=\"0.55\"><path d=\"M16 70 L28 34 L40 70Z\"/><path d=\"M40 70 L54 22 L68 70Z\"/><path d=\"M60 70 L70 44 L80 70Z\"/></g><g fill=\"#2F5236\" fill-opacity=\"0.3\"><path d=\"M0 70 L10 46 L20 70Z\"/><path d=\"M30 70 L38 50 L46 70Z\"/></g></svg>",
  nature: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 80 80\" preserveAspectRatio=\"xMidYMid slice\"><defs><linearGradient id=\"g_nature\" x1=\"0\" y1=\"0\" x2=\"0.4\" y2=\"1\"><stop offset=\"0\" stop-color=\"#D6E8D6\"/><stop offset=\"1\" stop-color=\"#80AD90\"/></linearGradient></defs><rect width=\"80\" height=\"80\" fill=\"url(#g_nature)\"/><path d=\"M0 50 C20 40 40 46 60 38 C70 34 76 36 80 34 V80 H0Z\" fill=\"#5F8F6E\" fill-opacity=\"0.45\"/><path d=\"M0 64 C20 56 44 62 80 52 V80 H0Z\" fill=\"#4E7E5D\" fill-opacity=\"0.5\"/><path d=\"M30 80 C36 70 50 66 58 58 C62 54 66 52 72 51\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.8\" stroke-width=\"2.4\" stroke-linecap=\"round\"/></svg>",
  birds: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 80 80\" preserveAspectRatio=\"xMidYMid slice\"><defs><linearGradient id=\"g_birds\" x1=\"0\" y1=\"0\" x2=\"0.4\" y2=\"1\"><stop offset=\"0\" stop-color=\"#F6E7CF\"/><stop offset=\"1\" stop-color=\"#E2BE91\"/></linearGradient></defs><rect width=\"80\" height=\"80\" fill=\"url(#g_birds)\"/><circle cx=\"58\" cy=\"26\" r=\"9\" fill=\"#FFF6E4\" fill-opacity=\"0.9\"/><g fill=\"none\" stroke=\"#6B5A45\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M16 40 q5 -5 9 0 q4 -5 9 0\"/><path d=\"M38 52 q4 -4 7 0 q3 -4 7 0\"/><path d=\"M26 24 q3 -3 6 0 q3 -3 6 0\"/></g></svg>",
  hum: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 80 80\" preserveAspectRatio=\"xMidYMid slice\"><defs><linearGradient id=\"g_hum\" x1=\"0\" y1=\"0\" x2=\"0.4\" y2=\"1\"><stop offset=\"0\" stop-color=\"#D2CDE8\"/><stop offset=\"1\" stop-color=\"#8F87BB\"/></linearGradient></defs><rect width=\"80\" height=\"80\" fill=\"url(#g_hum)\"/><g fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"1.4\"><circle cx=\"40\" cy=\"40\" r=\"8\" stroke-opacity=\"0.8\"/><circle cx=\"40\" cy=\"40\" r=\"16\" stroke-opacity=\"0.55\"/><circle cx=\"40\" cy=\"40\" r=\"24\" stroke-opacity=\"0.35\"/><circle cx=\"40\" cy=\"40\" r=\"32\" stroke-opacity=\"0.2\"/></g></svg>",
};

// ---------- Storage ----------
const KEYS = {
  prefs: "omm-preferences",
  defaultSession: "omm-default-session",
  lastSession: "omm-last-session",
  activeSession: "omm-active-session",
  moods: "omm-mood-entries",
  completed: "omm-completed-sessions",
  // Older versions of the app. Read once so history carries over.
  oldPrefs: "omm-prefs",
  oldSessions: "omm-sessions",
  olderSessions: "still-sessions",
};

async function readJSON(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function writeJSON(key, value) {
  AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});
}

// ---------- Helpers ----------
function fmt(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// Where the breath is at time t: phase, its length, a step id (changes at every phase boundary)
// and the bubble size. Based on the clock, so it stays exact over long sessions.
// Where the breath is at time t: phase, its length and position, a step id (changes at every
// phase boundary), the bubble size, and which look the orb has (vis) and had before (prevVis).
// Based on the clock, so it stays exact over long sessions.
function visualOf(steps, i) {
  const kind = steps[i][0];
  if (kind !== "hold") return kind;
  const before = steps[(i - 1 + steps.length) % steps.length][0];
  return before === "in" ? "hold" : "rest";
}

function breathAt(rhythmKey, t) {
  const steps = rhythmSteps(rhythmKey);
  if (!steps) return { key: "free", vis: "hold", prevVis: "hold", len: 0, pos: 0, step: -1, scale: 0.8 };
  const total = steps.reduce((sum, s) => sum + s[1], 0);
  const cycle = Math.floor(t / total);
  let r = t - cycle * total;
  for (let i = 0; i < steps.length; i++) {
    const [kind, len] = steps[i];
    if (r < len) {
      // Sine easing: the breath slows gently at each turn instead of stopping abruptly.
      const k = (1 - Math.cos(Math.PI * (r / len))) / 2;
      const vis = visualOf(steps, i);
      let scale;
      if (kind === "in") scale = 0.62 + 0.38 * k;
      else if (kind === "out") scale = 1 - 0.38 * k;
      else scale = vis === "hold" ? 1 : 0.62;
      return {
        key: kind,
        vis,
        prevVis: visualOf(steps, (i - 1 + steps.length) % steps.length),
        len,
        pos: r / len,
        step: cycle * steps.length + i,
        scale,
      };
    }
    r -= len;
  }
  return { key: "in", vis: "in", prevVis: "in", len: 0, pos: 0, step: -1, scale: 0.62 };
}

function breathsPerMinute(rhythmKey) {
  const steps = rhythmSteps(rhythmKey);
  if (!steps) return null;
  const total = steps.reduce((sum, s) => sum + s[1], 0);
  return Math.round((60 / total) * 10) / 10;
}

function firstPhase(rhythmKey) {
  const steps = rhythmSteps(rhythmKey);
  if (!steps) return { key: "free", len: 0 };
  return { key: steps[0][0], len: steps[0][1] };
}

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function computeStats(list) {
  const days = new Set(list.map((s) => dayKey(new Date(s.at))));
  let streak = 0;
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  const now = new Date();
  const monthPrefix = dayKey(now).slice(0, 7);
  let daysThisMonth = 0;
  days.forEach((k) => {
    if (k.startsWith(monthPrefix)) daysThisMonth++;
  });
  return {
    days,
    streak,
    daysThisMonth,
    sessions: list.length,
    minutes: list.reduce((sum, s) => sum + (s.duration || 0), 0),
  };
}

// Monotonic clock (never jumps if the phone's time changes). Animation and haptics both read it.
function nowMs() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

// How strong the vibration should be at this point in the breath (0 = nothing, 1 = strongest).
// Inhale swells from soft to strongest, then fades just before the next phase.
// Exhale starts gentle and fades to silence. Hold is always silent.
function hapticIntensity(key, pos) {
  if (key === "in") {
    if (pos < 0.85) {
      const k = pos / 0.85;
      return 0.15 + 0.85 * k * k * (3 - 2 * k);
    }
    return Math.max(0, 1 - (pos - 0.85) / 0.15);
  }
  if (key === "out") {
    const fadeIn = pos < 0.06 ? 0.5 + 0.5 * (pos / 0.06) : 1;
    return fadeIn * 0.65 * Math.pow(1 - pos, 1.3);
  }
  return 0;
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- Audio ----------
// Background sounds are loaded only when a session starts, and released when it ends.
const AMBIENT_SOURCES = {
  rain: require("./assets/sounds/rain.wav"),
  nature: require("./assets/sounds/nature.wav"),
  forest: require("./assets/sounds/forest.wav"),
  brown: require("./assets/sounds/brown_noise.wav"),
  birds: require("./assets/sounds/birds.wav"),
  ocean: require("./assets/sounds/ocean.wav"),
  hum: require("./assets/sounds/hum.wav"),
  omm: require("./assets/sounds/omm_welcome.mp3"), // the same short chant as the welcome sound, repeated
  gong: require("./assets/sounds/gong.wav"),
};

function releasePlayer(p) {
  try {
    p.pause();
    p.remove();
  } catch (_) {}
}

// ---------- Audio fades ----------
// One fade per player at a time, so a new fade always replaces an old one.
const activeFades = new Map();

function cancelFade(player) {
  const id = activeFades.get(player);
  if (id !== undefined) {
    clearInterval(id);
    activeFades.delete(player);
  }
}

function fadeTo(player, target, ms, onDone) {
  cancelFade(player);
  const start = player.volume;
  const steps = 20;
  let i = 0;
  const id = setInterval(() => {
    i++;
    player.volume = start + (target - start) * (i / steps);
    if (i >= steps) {
      cancelFade(player);
      onDone && onDone();
    }
  }, ms / steps);
  activeFades.set(player, id);
}

// ---------- End-of-session notification ----------
// The in-app bell handles the foreground, so the notification stays silent there.
const END_CHANNEL = "session-end";
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

// ---------- Theme ----------
const ThemeCtx = createContext(null);
const useTheme = () => useContext(ThemeCtx);

// ---------- App ----------
export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

const DEFAULT_PREFS = {
  bellOn: true,
  hapticsOn: true,
  ambientVolume: 0.8,
  reduceMotion: false,
  welcomeSound: true,
  language: "en",
};

function Main() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const scheme = useColorScheme();
  const theme = scheme === "dark" ? THEMES.dark : THEMES.light;

  // Saved data
  const [dataLoaded, setDataLoaded] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [prefs, setPrefs] = useState({ ...DEFAULT_PREFS, language: detectLanguage() });
  const [defaultSession, setDefaultSession] = useState(FIRST_SESSION);
  const [lastSession, setLastSession] = useState(FIRST_SESSION);
  const [completed, setCompleted] = useState([]);
  const [moods, setMoods] = useState([]);

  // Navigation
  const [tab, setTab] = useState("home");
  const [sheetPreset, setSheetPreset] = useState(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [soundsOpen, setSoundsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feelingDismissed, setFeelingDismissed] = useState(false);

  // Session
  const [mode, setMode] = useState("idle"); // idle | running | paused | finished
  const [activeSession, setActiveSession] = useState(null);
  const [phase, setPhaseState] = useState(firstPhase(FIRST_SESSION.rhythm));
  const [clock, setClockState] = useState(FIRST_SESSION.duration * 60);
  // What's on screen right now. The animation loop only touches React state when these change.
  const shown = useRef({ sec: null, key: null, len: null });
  function setClock(v) {
    shown.current.sec = Math.floor(v);
    setClockState(v);
  }
  function setPhase(p) {
    shown.current.key = p.key;
    shown.current.len = p.len;
    setPhaseState(p);
  }
  const [note, setNote] = useState("");
  const [finished, setFinished] = useState(null); // { id, mins, bpm }

  const scale = useRef(new Animated.Value(1)).current;
  const progress = useRef(new Animated.Value(0)).current;
  // How much of each phase color the orb shows (they crossfade), plus the hold shimmer.
  const tones = useRef(Object.fromEntries(ORB_KEYS.map((k) => [k, new Animated.Value(k === "hold" ? 1 : 0)]))).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const toneCache = useRef({ in: 0, hold: 1, out: 0, rest: 0, shimmer: 0 });

  function setTone(k, v) {
    if (Math.abs(toneCache.current[k] - v) < 0.004) return;
    toneCache.current[k] = v;
    (k === "shimmer" ? shimmer : tones[k]).setValue(v);
  }

  // Colors blend into the new phase over its first third, so changes feel gentle, never abrupt.
  function paintBreath(b, el) {
    // The very first breath of a session blends from the resting (idle) look.
    if (b.step === 0) b = { ...b, prevVis: "hold" };
    const k = Math.min(1, b.pos / 0.35);
    const blend = k * k * (3 - 2 * k);
    ORB_KEYS.forEach((key) => {
      let v = key === b.vis ? blend : 0;
      if (key === b.prevVis && b.prevVis !== b.vis) v += 1 - blend;
      if (key === b.vis && b.prevVis === b.vis) v = 1;
      setTone(key, v);
    });
    // A very subtle shimmer while holding at the top of the breath.
    setTone("shimmer", b.vis === "hold" && b.key === "hold" ? Math.sin(Math.PI * b.pos) * (0.5 + 0.5 * Math.sin(el * 3.5)) * 0.22 : 0);
  }

  function paintIdle() {
    ORB_KEYS.forEach((key) => setTone(key, key === "hold" ? 1 : 0));
    setTone("shimmer", 0);
  }
  const idleLoop = useRef(null);
  const raf = useRef(0);
  const timing = useRef({ startedAt: 0, pausedAt: 0, pausedTotal: 0 });
  const modeRef = useRef("idle");
  const activeRef = useRef(null);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const t = useMemo(() => makeT(prefs.language), [prefs.language]);
  const tRef = useRef(t);
  tRef.current = t;
  const lastSessionRef = useRef(lastSession);
  lastSessionRef.current = lastSession;
  const lastSaveRef = useRef(0);
  const lastStep = useRef(null);
  const endNotifId = useRef(null);
  const endNotifToken = useRef(0);
  const activeAmbient = useRef(null);
  const backgroundAt = useRef(null);
  const welcomePlayed = useRef(false);

  // Audio players
  const bell = useAudioPlayer(require("./assets/sounds/bell.wav"));
  const welcome = useAudioPlayer(require("./assets/sounds/omm_welcome.mp3"));
  const welcomeStatus = useAudioPlayerStatus(welcome);

  function setModeBoth(m) {
    modeRef.current = m;
    setMode(m);
  }

  // ----- Load saved data -----
  useEffect(() => {
    // Keep sound going with the screen off, and pause other apps' audio during a session.
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => {});
    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync(END_CHANNEL, {
        name: "Session end bell",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "bell.wav",
      }).catch(() => {});
    }

    (async () => {
      try {
      const osReduceMotion = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
      const savedPrefs = await readJSON(KEYS.prefs);
      const oldPrefs = savedPrefs ? null : await readJSON(KEYS.oldPrefs);
      setPrefs({
        ...DEFAULT_PREFS,
        ...(savedPrefs || {}),
        bellOn: savedPrefs?.bellOn ?? oldPrefs?.bellOn ?? true,
        hapticsOn: savedPrefs?.hapticsOn ?? oldPrefs?.hapticsOn ?? true,
        reduceMotion: savedPrefs?.reduceMotion ?? !!osReduceMotion,
        language: savedPrefs?.language ?? detectLanguage(),
      });

      const def = cleanConfig(await readJSON(KEYS.defaultSession));
      const validDef = def && (def.id === "custom" || PRESETS.some((p) => p.id === def.id));
      // Built-in presets always use their current settings.
      const fresh = (cfg) => {
        const p = PRESETS.find((x) => x.id === cfg.id);
        return p ? presetConfig(p) : cfg;
      };
      if (validDef) setDefaultSession(fresh(def));
      const savedLast = cleanConfig(await readJSON(KEYS.lastSession));
      const last = fresh(savedLast || (validDef ? def : FIRST_SESSION));
      setLastSession(last);
      setClock(last.duration * 60);
      setPhase(firstPhase(last.rhythm));

      let done = await readJSON(KEYS.completed);
      if (!done) {
        const old = (await readJSON(KEYS.oldSessions)) || (await readJSON(KEYS.olderSessions)) || [];
        done = old.map((s) => ({ id: newId(), preset: "earlier", at: s.at, duration: s.mins }));
        writeJSON(KEYS.completed, done);
      }
      setCompleted(done);
      setMoods((await readJSON(KEYS.moods)) || []);

      // If the app was closed during a session, bring it back paused.
      const active = await readJSON(KEYS.activeSession);
      if (active) active.config = cleanConfig(active.config);
      if (active && active.config && typeof active.elapsed === "number" && (active.config.duration === 0 || active.elapsed < active.config.duration * 60)) {
        if (Platform.OS !== "web") Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
        const now = nowMs();
        timing.current = { startedAt: now - active.elapsed * 1000, pausedAt: now, pausedTotal: 0 };
        activeRef.current = active.config;
        lastStep.current = breathAt(active.config.rhythm, active.elapsed).step;
        setActiveSession(active.config);
        setClock(active.config.duration === 0 ? active.elapsed : active.config.duration * 60 - active.elapsed);
        if (active.config.duration > 0) progress.setValue(active.elapsed / (active.config.duration * 60));
        scale.setValue(breathAt(active.config.rhythm, active.elapsed).scale);
        paintBreath(breathAt(active.config.rhythm, active.elapsed), active.elapsed);
        setPhase({ key: "paused" });
        setNote("note.restored");
        setModeBoth("paused");
        setTab("omm");
      }
      } catch (e) {
        // If saved data can't be read, start fresh rather than getting stuck.
        AsyncStorage.removeItem(KEYS.activeSession).catch(() => {});
      } finally {
        setDataLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (dataLoaded) writeJSON(KEYS.prefs, prefs);
    if (!prefs.hapticsOn) stopHaptics();
    // Background volume changes apply right away.
    const p = activeAmbient.current;
    if (p && modeRef.current === "running") {
      cancelFade(p);
      p.volume = prefs.ambientVolume;
    }
  }, [prefs, dataLoaded]);

  // Omm sound when the app opens
  useEffect(() => {
    if (dataLoaded && welcomeStatus.isLoaded && !welcomePlayed.current) {
      welcomePlayed.current = true;
      playWelcome();
    }
  }, [dataLoaded, welcomeStatus.isLoaded]);

  // Backgrounding: save the session; welcome back after 5+ minutes away.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        saveActive();
        stopHaptics();
        if (!backgroundAt.current) backgroundAt.current = Date.now();
      } else {
        if (backgroundAt.current && Date.now() - backgroundAt.current > 5 * 60 * 1000) playWelcome();
        backgroundAt.current = null;
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    stopHaptics();
    cancelEndBell();
    if (activeAmbient.current) releasePlayer(activeAmbient.current);
  }, []);

  // Gentle idle pulse
  useEffect(() => {
    const idle = mode === "idle" || mode === "finished";
    if (idle && !prefs.reduceMotion) {
      idleLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 0.9, duration: 4500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 4500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
      idleLoop.current.start();
    } else if (idle) {
      scale.setValue(1);
    }
    return () => idleLoop.current && idleLoop.current.stop();
  }, [mode, prefs.reduceMotion]);

  // ----- Haptics: continuous guidance that follows the breath -----
  // Expo Go can't set vibration strength, so strength comes from soft pulses:
  // more often and a little longer when stronger, fewer and shorter when softer.
  // Pulses are driven by the same animation frame and clock as the bubble, so they never drift.
  const haptic = useRef({ last: null, acc: 0 });

  function stopHaptics() {
    haptic.current = { last: null, acc: 0 };
    if (Platform.OS === "android") Vibration.cancel();
    if (Platform.OS === "web" && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(0);
      } catch (_) {}
    }
  }

  function pulse(level) {
    if (Platform.OS === "ios") {
      const style = level < 0.4 ? Haptics.ImpactFeedbackStyle.Soft : level < 0.75 ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium;
      Haptics.impactAsync(style).catch(() => {});
      return;
    }
    const ms = Math.round(10 + 22 * level);
    if (Platform.OS === "android") {
      Vibration.vibrate(ms);
      return;
    }
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(ms);
      } catch (_) {}
    }
  }

  // Called on every animation frame with the current breath and elapsed time (seconds).
  function guideHaptics(b, el, phaseChanged) {
    const h = haptic.current;
    if (!prefsRef.current.hapticsOn) {
      h.last = el;
      return;
    }
    const level = hapticIntensity(b.key, b.pos);
    const dt = h.last == null ? 0 : el - h.last;
    h.last = el;
    // A new inhale or exhale starts with a soft pulse right away.
    if (phaseChanged) h.acc = b.key === "in" || b.key === "out" ? 1 : 0;
    // After a gap (app was in the background), resume quietly instead of catching up.
    if (dt < 0 || dt > 0.12) return;
    if (level < 0.05) {
      h.acc = 0;
      return;
    }
    const rate = Platform.OS === "ios" ? 3 + 7 * level : 3 + 9 * level; // pulses per second
    h.acc += dt * rate;
    if (h.acc >= 1) {
      h.acc -= Math.floor(h.acc);
      pulse(level);
    }
  }

  // ----- Notifications -----
  function cancelEndBell() {
    endNotifToken.current++;
    const id = endNotifId.current;
    endNotifId.current = null;
    if (id && Platform.OS !== "web") Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  }

  async function scheduleEndBell(seconds, config) {
    cancelEndBell();
    if (Platform.OS === "web" || !prefsRef.current.bellOn || config.duration === 0 || seconds < 1) return;
    const token = endNotifToken.current;
    try {
      let { granted } = await Notifications.getPermissionsAsync();
      if (!granted) ({ granted } = await Notifications.requestPermissionsAsync());
      if (!granted || token !== endNotifToken.current) return;
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: tRef.current("notif.title"),
          body: tRef.current("notif.body", { name: sessionName(config, tRef.current) }),
          sound: "bell.wav",
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: Math.round(seconds),
          channelId: END_CHANNEL,
        },
      });
      if (token !== endNotifToken.current) Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      else endNotifId.current = id;
    } catch (_) {}
  }

  // ----- Other sounds -----
  function playWelcome() {
    if (!prefsRef.current.welcomeSound) return;
    const m = modeRef.current;
    if (m === "running" || m === "paused") return;
    try {
      cancelFade(welcome);
      welcome.volume = 0.8;
      welcome.seekTo(0);
      welcome.play();
    } catch (_) {}
  }

  function playBell() {
    if (!prefsRef.current.bellOn) return;
    try {
      bell.seekTo(0);
      bell.volume = 1;
      bell.play();
    } catch (_) {}
  }

  function startAmbient(soundKey) {
    if (!soundKey || soundKey === "none" || !AMBIENT_SOURCES[soundKey]) return;
    let p;
    try {
      p = createAudioPlayer(AMBIENT_SOURCES[soundKey]);
    } catch (_) {
      return;
    }
    activeAmbient.current = p;
    p.loop = true;
    p.volume = 0;
    p.play();
    fadeTo(p, prefsRef.current.ambientVolume, 3000);
  }

  function stopAmbient(ms = 2500) {
    const p = activeAmbient.current;
    if (!p) return;
    activeAmbient.current = null;
    fadeTo(p, 0, ms, () => releasePlayer(p));
  }

  // ----- Session engine -----
  function elapsed() {
    const tm = timing.current;
    const pausedNow = modeRef.current === "paused" && tm.pausedAt ? nowMs() - tm.pausedAt : 0;
    return (nowMs() - tm.startedAt - tm.pausedTotal - pausedNow) / 1000;
  }

  function saveActive() {
    const m = modeRef.current;
    if ((m === "running" || m === "paused") && activeRef.current) {
      writeJSON(KEYS.activeSession, { config: activeRef.current, elapsed: Math.max(0, elapsed()) });
    }
  }

  function clearActive() {
    AsyncStorage.removeItem(KEYS.activeSession).catch(() => {});
  }

  function tick() {
    const config = activeRef.current;
    if (!config || modeRef.current !== "running") return;
    const el = Math.max(0, elapsed());
    const endless = config.duration === 0;
    const left = config.duration * 60 - el;
    if (!endless && left <= 0) {
      finish(true);
      return;
    }
    const b = breathAt(config.rhythm, el);
    const phaseChanged = b.step !== lastStep.current;
    lastStep.current = b.step;
    if (b.step >= 0) guideHaptics(b, el, phaseChanged);
    scale.setValue(b.scale);
    paintBreath(b, el);
    if (!endless) progress.setValue(el / (config.duration * 60));
    if (b.key !== shown.current.key || b.len !== shown.current.len) setPhase({ key: b.key, len: b.len });
    const value = endless ? el : left;
    if (Math.floor(value) !== shown.current.sec) setClock(value);
    if (Date.now() - lastSaveRef.current > 5000) {
      lastSaveRef.current = Date.now();
      saveActive();
    }
    raf.current = requestAnimationFrame(tick);
  }

  function selectSession(config) {
    lastSessionRef.current = config;
    setLastSession(config);
    writeJSON(KEYS.lastSession, config);
    if (modeRef.current === "idle" || modeRef.current === "finished") {
      setClock(config.duration * 60);
      setPhase(firstPhase(config.rhythm));
      setModeBoth("idle");
      setNote("");
    }
  }

  function startSession(config) {
    // Starting a new session ends the one in progress.
    const m = modeRef.current;
    if (m === "running" || m === "paused") finish(false, { quiet: true });

    selectSession(config);
    idleLoop.current && idleLoop.current.stop();
    activeRef.current = { ...config };
    setActiveSession(activeRef.current);
    lastStep.current = null;
    stopHaptics();
    setNote("");
    setFinished(null);
    progress.setValue(0);
    setClock(config.duration === 0 ? 0 : config.duration * 60);
    setPhase(firstPhase(config.rhythm));
    setModeBoth("running");
    setTab("omm");
    if (welcome.playing) fadeTo(welcome, 0, 800, () => welcome.pause());
    playBell();
    startAmbient(config.sound);
    scheduleEndBell(config.duration * 60, config);
    activateKeepAwakeAsync().catch(() => {});

    // The breath starts after a short opening animation (shorter with reduced motion).
    const lead = prefsRef.current.reduceMotion ? 0 : 600;
    timing.current = { startedAt: nowMs() + lead, pausedAt: 0, pausedTotal: 0 };
    lastSaveRef.current = 0;
    saveActive();
    const session = activeRef.current;
    const begin = () => {
      // Skip if the session was paused or ended during the opening animation.
      if (modeRef.current !== "running" || activeRef.current !== session) return;
      raf.current = requestAnimationFrame(tick);
    };
    if (prefsRef.current.reduceMotion) {
      scale.setValue(0.62);
      begin();
    } else {
      Animated.timing(scale, { toValue: 0.62, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }).start(begin);
    }
  }

  function togglePause() {
    if (modeRef.current === "running") {
      // Freeze everything where it is.
      cancelAnimationFrame(raf.current);
      timing.current.pausedAt = nowMs();
      stopHaptics();
      cancelEndBell();
      if (activeAmbient.current) {
        cancelFade(activeAmbient.current);
        activeAmbient.current.pause();
      }
      setTone("shimmer", 0);
      setModeBoth("paused");
      setPhase({ key: "paused" });
      saveActive();
    } else if (modeRef.current === "paused") {
      // Resume from the same spot in the same phase.
      timing.current.pausedTotal += nowMs() - timing.current.pausedAt;
      timing.current.pausedAt = 0;
      haptic.current = { last: null, acc: 0 };
      setNote("");
      const config = activeRef.current;
      setModeBoth("running");
      scheduleEndBell(config.duration * 60 - elapsed(), config);
      if (activeAmbient.current) {
        activeAmbient.current.play();
        fadeTo(activeAmbient.current, prefsRef.current.ambientVolume, 1000);
      } else {
        startAmbient(config.sound);
      }
      activateKeepAwakeAsync().catch(() => {});
      raf.current = requestAnimationFrame(tick);
    }
  }

  function finish(reachedEnd, opts = {}) {
    cancelAnimationFrame(raf.current);
    stopHaptics();
    const config = activeRef.current;
    if (!config) return;
    const tm = timing.current;
    if (tm.pausedAt && modeRef.current === "paused") {
      tm.pausedTotal += nowMs() - tm.pausedAt;
      tm.pausedAt = 0;
    }
    modeRef.current = "ending";
    const total = Math.max(0, (nowMs() - tm.startedAt - tm.pausedTotal) / 1000);

    const endless = config.duration === 0;
    // An endless session counts once it lasts at least a minute.
    const counts = reachedEnd || (endless && total >= 60);
    const mins = endless ? Math.floor(total / 60) : config.duration;
    // If the app was in the background at the end, the notification already rang.
    const ringsLate = !endless && total - config.duration * 60 > 1.5;

    cancelEndBell();
    stopAmbient(opts.quiet ? 600 : 2500);
    if (counts && !ringsLate && !opts.quiet) playBell();
    deactivateKeepAwake();
    clearActive();
    activeRef.current = null;
    lastStep.current = null;
    setActiveSession(null);

    if (counts) {
      const record = { id: newId(), preset: config.id, at: new Date().toISOString(), duration: mins };
      setCompleted((prev) => {
        const next = [...prev, record].slice(-2000);
        writeJSON(KEYS.completed, next);
        return next;
      });
      if (!opts.quiet) setFinished({ id: record.id, mins, bpm: breathsPerMinute(config.rhythm), mood: null });
    }
    if (counts && !opts.quiet) {
      setModeBoth("finished");
    } else {
      if (!opts.quiet) setNote("note.ended");
      setModeBoth("idle");
    }
    const next = lastSessionRef.current;
    setClock(next.duration * 60);
    setPhase(firstPhase(next.rhythm));
    progress.setValue(0);
    paintIdle();
    if (prefsRef.current.reduceMotion) scale.setValue(1);
    else Animated.timing(scale, { toValue: 1, duration: 800, useNativeDriver: true }).start();
  }

  function saveDefault(config) {
    setDefaultSession(config);
    writeJSON(KEYS.defaultSession, config);
  }

  // Feelings: "before" from Home, "after" from the end of a session.
  function logMood(mood, when, sessionId) {
    setMoods((prev) => {
      let next = prev;
      const last = prev[prev.length - 1];
      // Changing your answer within 30 minutes replaces it instead of adding another.
      const sameSession = last && (last.session || null) === (sessionId || null);
      if (last && last.when === when && Date.now() - new Date(last.at).getTime() < 30 * 60 * 1000 && sameSession) {
        next = prev.slice(0, -1);
      }
      // The question on Home is answered once per day.
      if (when === "before" && prev.some((m) => m.when === "before" && dayKey(new Date(m.at)) === dayKey(new Date()))) return prev;
      next = [...next, { id: newId(), at: new Date().toISOString(), mood, when, session: sessionId || null }].slice(-2000);
      writeJSON(KEYS.moods, next);
      return next;
    });
  }

  // ----- Render -----
  const ready = fontsLoaded && dataLoaded;
  const inSession = mode === "running" || mode === "paused";
  const stats = useMemo(() => computeStats(completed), [completed]);
  const homeMood = useMemo(() => {
    const today = dayKey(new Date());
    for (let i = moods.length - 1; i >= 0; i--) {
      if (moods[i].when === "before" && dayKey(new Date(moods[i].at)) === today) return moods[i].mood;
    }
    return null;
  }, [moods]);
  const showFeeling = ready && splashDone && tab === "home" && !homeMood && !feelingDismissed && !inSession && !sheetPreset && !builderOpen && !soundsOpen && !settingsOpen;

  return (
    <I18n.Provider value={t}>
      <ThemeCtx.Provider value={theme}>
        <SafeAreaView style={theme.s.screen} edges={["left", "right"]}>
          <StatusBar style={theme.dark ? "light" : "dark"} />
          {ready && (
            <View style={{ flex: 1 }}>
              <View style={{ flex: 1 }}>
                {tab === "home" && (
                  <HomeScreen
                    defaultSession={defaultSession}
                    mood={homeMood}
                    onOpenPreset={setSheetPreset}
                    onStartPreset={(p) => startSession(presetConfig(p))}
                    onOpenBuilder={() => setBuilderOpen(true)}
                    onOpenSounds={() => setSoundsOpen(true)}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onPlaySound={(key) => startSession(soundConfig(key))}
                  />
                )}
                {tab === "omm" && (
                  <BreatheScreen
                    mode={mode}
                    session={inSession ? activeSession : lastSession}
                    defaultSession={defaultSession}
                    phase={phase}
                    clock={clock}
                    note={note}
                    finished={finished}
                    scale={scale}
                    progress={progress}
                    tones={tones}
                    shimmer={shimmer}
                    reduceMotion={prefs.reduceMotion}
                    onStart={() => startSession(lastSession)}
                    onTogglePause={togglePause}
                    onEnd={() => finish(false)}
                    onUseDefault={() => selectSession(defaultSession)}
                    onMood={(m) => {
                      logMood(m, "after", finished && finished.id);
                      setFinished((f) => (f ? { ...f, mood: m } : f));
                    }}
                    onDone={() => {
                      setModeBoth("idle");
                      setTab("home");
                    }}
                    onSeeRhythm={() => {
                      setModeBoth("idle");
                      setTab("progress");
                    }}
                  />
                )}
                {tab === "progress" && <RhythmScreen stats={stats} moods={moods} />}
              </View>
              <TabBar tab={tab} setTab={setTab} inSession={inSession} />

              <PresetSheet
                preset={sheetPreset}
                isDefault={sheetPreset && sameConfig(defaultSession, presetConfig(sheetPreset))}
                onClose={() => setSheetPreset(null)}
                onStart={() => {
                  const config = presetConfig(sheetPreset);
                  setSheetPreset(null);
                  startSession(config);
                }}
                onSetDefault={() => saveDefault(presetConfig(sheetPreset))}
              />

              <FeelingPopover visible={showFeeling} onSelect={(m) => logMood(m, "before")} onClose={() => setFeelingDismissed(true)} />

              <SoundsSheet
                visible={soundsOpen}
                onClose={() => setSoundsOpen(false)}
                onPlay={(key) => {
                  setSoundsOpen(false);
                  startSession(soundConfig(key));
                }}
              />

              <SettingsSheet visible={settingsOpen} prefs={prefs} setPrefs={setPrefs} onClose={() => setSettingsOpen(false)} />

              <BuilderSheet
                visible={builderOpen}
                initial={defaultSession.id === "custom" ? defaultSession : lastSession}
                defaultSession={defaultSession}
                onClose={() => setBuilderOpen(false)}
                onStart={(draft) => {
                  setBuilderOpen(false);
                  startSession(customConfig(draft));
                }}
                onSaveDefault={(draft) => {
                  const config = customConfig(draft);
                  saveDefault(config);
                  selectSession(config);
                }}
              />
            </View>
          )}
          {!splashDone && (
            <Splash reduceMotion={prefs.reduceMotion} ready={ready} onDone={() => setSplashDone(true)} />
          )}
        </SafeAreaView>
      </ThemeCtx.Provider>
    </I18n.Provider>
  );
}

// ---------- Splash ----------
// The "շնչիր" (breathe) animation: a line that turns into the word and settles back.
// Its 6 frames are in assets/images/splash/ (made from splash-shnchir.gif) and blend into each other.
// It always plays at normal speed (2.7 seconds, like the GIF), then fades out once the app is ready.
const SPLASH_FRAMES = [
  require("./assets/images/splash/frame-0.png"),
  require("./assets/images/splash/frame-1.png"),
  require("./assets/images/splash/frame-2.png"),
  require("./assets/images/splash/frame-3.png"),
  require("./assets/images/splash/frame-4.png"),
  require("./assets/images/splash/frame-5.png"),
];
const SPLASH_RATIO = 358 / 112; // width / height of each frame
const SPLASH_BG = "#FBFCFC"; // the frames' own background color, so no edge shows
const SPLASH_NORMAL_MS = 2250; // the whole animation at normal speed (5 steps of 450 ms)
const SPLASH_HOLD_MS = 450; // the last frame stays this long, like in the GIF (2250 + 450 = 2.7 seconds)
const SPLASH_STILL = 0.6; // with Reduce motion on: show the word without moving (frame 3)

function Splash({ reduceMotion, ready, onDone }) {
  const { width } = useWindowDimensions();
  const progress = useRef(new Animated.Value(reduceMotion ? SPLASH_STILL : 0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const [played, setPlayed] = useState(false);

  // Frame 0 is always there; each next frame fades in over the one before it.
  const opacities = useMemo(() => {
    const last = SPLASH_FRAMES.length - 1;
    return SPLASH_FRAMES.map((_, i) =>
      i === 0 ? 1 : progress.interpolate({ inputRange: [(i - 1) / last, i / last], outputRange: [0, 1], extrapolate: "clamp" })
    );
  }, []);

  // Plays the animation once at normal speed.
  useEffect(() => {
    if (reduceMotion) {
      const id = setTimeout(() => setPlayed(true), 800);
      return () => clearTimeout(id);
    }
    const run = Animated.timing(progress, { toValue: 1, duration: SPLASH_NORMAL_MS, easing: Easing.linear, useNativeDriver: true });
    let hold;
    run.start(({ finished }) => {
      if (finished) hold = setTimeout(() => setPlayed(true), SPLASH_HOLD_MS);
    });
    return () => {
      run.stop();
      clearTimeout(hold);
    };
  }, []);

  // Close when the animation is done and the app is ready.
  useEffect(() => {
    if (played && ready) {
      Animated.timing(fade, { toValue: 0, duration: 450, useNativeDriver: true }).start(onDone);
    }
  }, [played, ready]);

  const w = Math.min(width, 520);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.splash, { backgroundColor: SPLASH_BG, opacity: fade }]} pointerEvents="none">
      <View style={{ width: w, height: w / SPLASH_RATIO }}>
        {SPLASH_FRAMES.map((frame, i) => (
          <Animated.Image
            key={i}
            source={frame}
            resizeMode="stretch"
            fadeDuration={0}
            style={[StyleSheet.absoluteFill, { opacity: opacities[i] }]}
          />
        ))}
      </View>
    </Animated.View>
  );
}

// ---------- Home ----------
function HomeScreen({ defaultSession, mood, onOpenPreset, onStartPreset, onOpenBuilder, onOpenSounds, onOpenSettings, onPlaySound }) {
  const t = useT();
  const { c, s, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const heroH = insets.top + 250;
  const hour = new Date().getHours();
  const rec = PRESETS.find((p) => p.id === recommend(mood, hour));
  const customIsDefault = defaultSession.id === "custom";

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={{ height: heroH }}>
        <View style={[StyleSheet.absoluteFill, { height: heroH + 40 }]}>
          <SvgXml xml={dark ? HERO_XML_DARK : HERO_XML} width={width} height={heroH + 40} />
        </View>
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 24 }}>
          <View style={s.heroTop}>
            <Logo width={96} color={c.link} />
            <Pressable
              onPress={onOpenSettings}
              accessibilityRole="button"
              accessibilityLabel={t("settings.title")}
              hitSlop={8}
              style={({ pressed }) => [s.gearBtn, pressed && { opacity: 0.8 }]}
            >
              <Icon name="gear" size={22} color={c.slate} />
            </Pressable>
          </View>
          <Text style={s.heroTitle}>{t(`greet.${timeOfDay(hour)}`)}</Text>
          <Text style={s.heroLead}>{t("home.subtitle")}</Text>
        </View>
      </View>

      <View style={s.panel}>
        <Pressable
          onPress={() => onStartPreset(rec)}
          accessibilityRole="button"
          accessibilityLabel={`${mood ? t("home.basedOnFeeling") : t("home.recommended")}: ${t(`preset.${rec.id}.name`)}, ${durationLabel(rec.duration, t)}`}
          style={({ pressed }) => [s.recCard, pressed && { opacity: 0.9 }]}
        >
          <View style={StyleSheet.absoluteFill}>
            <SvgXml xml={dark ? HERO_XML_DARK : HERO_XML} width="100%" height="100%" />
          </View>
          <Text style={s.recLabel}>{mood ? t("home.basedOnFeeling") : t("home.recommended")}</Text>
          <Text style={s.recName}>{t(`preset.${rec.id}.name`)}</Text>
          <Text style={s.recMeta}>
            {durationLabel(rec.duration, t)}  ·  {paceText(rec.rhythm, t)}
          </Text>
          <View style={s.recPlay}>
            <Icon name="play" size={20} color={c.white} />
          </View>
        </Pressable>

        <Text style={[s.sectionTitle, { marginTop: 28, marginBottom: 14 }]}>{t("home.allSessions")}</Text>
        <View style={s.grid}>
          {PRESETS.map((p) => {
            const isDefault = sameConfig(defaultSession, presetConfig(p));
            const name = t(`preset.${p.id}.name`);
            return (
              <Pressable
                key={p.id}
                onPress={() => onOpenPreset(p)}
                accessibilityRole="button"
                accessibilityLabel={`${name}, ${durationLabel(p.duration, t)}${isDefault ? `, ${t("badge.default")}` : ""}`}
                style={({ pressed }) => [s.presetCard, { backgroundColor: dark ? p.bgDark : p.bg, opacity: pressed ? 0.85 : 1 }]}
              >
                <View style={s.presetTop}>
                  <Icon name={p.icon} size={28} color={c.link} />
                  {isDefault && <Text style={s.badge}>{t("badge.default")}</Text>}
                </View>
                <Text style={s.presetName}>{name}</Text>
                <Text style={s.presetSub}>{t(`preset.${p.id}.sub`)}</Text>
                <View style={s.presetBottom}>
                  <Text style={s.presetMins}>{durationLabel(p.duration, t)}</Text>
                  <Icon name="chevron" size={18} color={c.slate} />
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>{t("home.sounds")}</Text>
          <Pressable onPress={onOpenSounds} accessibilityRole="button" hitSlop={10} style={s.row}>
            <Text style={s.seeAll}>{t("home.seeAll")}</Text>
            <Icon name="chevron" size={16} color={c.link} />
          </Pressable>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
        {HEALING.slice(0, 4).map((key) => (
          <SoundCard key={key} soundKey={key} width={Math.min(width * 0.72, 300)} onPress={() => onPlaySound(key)} />
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: 20 }}>
        <Pressable
          onPress={onOpenBuilder}
          accessibilityRole="button"
          style={({ pressed }) => [s.customCard, pressed && { opacity: 0.85 }]}
        >
          <Icon name="sliders" size={30} color={c.link} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.customTitle}>{t("custom.title")}</Text>
            <Text style={s.customSub}>
              {customIsDefault
                ? t("custom.yourDefault", {
                    summary: `${durationLabel(defaultSession.duration, t)} · ${t(`rhythm.${defaultSession.rhythm}`)} · ${t(`sound.${defaultSession.sound}`)}`,
                  })
                : t("custom.sub")}
            </Text>
          </View>
          <Icon name="chevron" size={20} color={c.slate} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

// ---------- Feelings ----------
function FeelingPopover({ visible, onSelect, onClose }) {
  const t = useT();
  const { s } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.popWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t("sheet.close")} />
        <View style={s.popCard}>
          <Text style={[s.sheetTitle, { textAlign: "center", marginBottom: 18 }]}>{t("home.feeling")}</Text>
          <MoodGrid selected={null} onSelect={onSelect} size={64} />
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={10}>
            <Text style={s.quietLink}>{t("home.notNow")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function MoodGrid({ selected, onSelect, size = 72 }) {
  const t = useT();
  const { c, s } = useTheme();
  return (
    <View style={s.moodGrid}>
      {MOODS.map((m) => {
        const on = selected === m;
        return (
          <Pressable
            key={m}
            onPress={() => onSelect(m)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t(`mood.${m}`)}
            style={({ pressed }) => [s.moodItem, pressed && { opacity: 0.8 }]}
          >
            <View
              style={[
                s.moodTile,
                { width: size, height: size, borderRadius: size / 2 },
                on && { borderColor: c.lagoon, borderWidth: 2.5 },
              ]}
            >
              <Image source={MOOD_IMAGES[m]} style={{ width: size - 6, height: size - 6 }} resizeMode="contain" />
            </View>
            <Text style={[s.moodLabel, on && { color: c.link, fontFamily: F.semibold }]} numberOfLines={1}>
              {t(`mood.${m}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SoundThumb({ soundKey, size }) {
  const { s } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: 14, overflow: "hidden" }}>
      <SvgXml xml={THUMBS[soundKey] || THUMBS.hum} width={size} height={size} />
      <View style={[s.playDot, { width: size * 0.36, height: size * 0.36, borderRadius: size, left: size * 0.1, bottom: size * 0.1 }]}>
        <Icon name="play" size={size * 0.2} color={LIGHT.slate} />
      </View>
    </View>
  );
}

function SoundCard({ soundKey, width, onPress }) {
  const t = useT();
  const { s } = useTheme();
  const name = t(`sound.${soundKey}`);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t("home.play", { name })}, ${t("min", { n: HEALING_MINUTES })}`}
      style={({ pressed }) => [s.soundCard, { width }, pressed && { opacity: 0.85 }]}
    >
      <SoundThumb soundKey={soundKey} size={84} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={s.soundName} numberOfLines={1}>{name}</Text>
        <Text style={s.soundDesc} numberOfLines={2}>{t(`soundDesc.${soundKey}`)}</Text>
        <Text style={s.soundMins}>{t("min", { n: HEALING_MINUTES })}</Text>
      </View>
    </Pressable>
  );
}

function SoundsSheet({ visible, onClose, onPlay }) {
  const t = useT();
  const { s } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={[s.sheetTitle, { marginBottom: 14 }]}>{t("home.sounds")}</Text>
      <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 10 }}>
        {HEALING.map((key) => {
          const name = t(`sound.${key}`);
          return (
            <Pressable
              key={key}
              onPress={() => onPlay(key)}
              accessibilityRole="button"
              accessibilityLabel={`${t("home.play", { name })}, ${t("min", { n: HEALING_MINUTES })}`}
              style={({ pressed }) => [s.soundRow, pressed && { opacity: 0.85 }]}
            >
              <SoundThumb soundKey={key} size={60} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.soundName}>{name}</Text>
                <Text style={s.soundDesc}>{t(`soundDesc.${key}`)}</Text>
              </View>
              <Text style={s.soundMins}>{t("min", { n: HEALING_MINUTES })}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

function SettingsSheet({ visible, prefs, setPrefs, onClose }) {
  const t = useT();
  const { s } = useTheme();
  const set = (patch) => setPrefs({ ...prefs, ...patch });
  return (
    <Sheet visible={visible} onClose={onClose}>
      <ScrollView style={{ maxHeight: 600 }}>
        <Text style={s.sheetTitle}>{t("settings.title")}</Text>
        <Text style={[s.prefLabel, { marginTop: 18 }]}>{t("prefs.language")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8, marginBottom: 14 }}>
          {LANGUAGES.map((l) => (
            <Chip key={l.code} label={l.name} selected={prefs.language === l.code} onPress={() => set({ language: l.code })} />
          ))}
        </View>
        <PrefRow label={t("prefs.haptics")} value={prefs.hapticsOn} onChange={(v) => set({ hapticsOn: v })} />
        <VolumeRow label={t("prefs.ambientVolume")} value={prefs.ambientVolume} onChange={(v) => set({ ambientVolume: v })} />
        <PrefRow label={t("prefs.bell")} value={prefs.bellOn} onChange={(v) => set({ bellOn: v })} />
        <PrefRow label={t("prefs.welcome")} value={prefs.welcomeSound} onChange={(v) => set({ welcomeSound: v })} />
        <PrefRow label={t("prefs.motion")} value={prefs.reduceMotion} onChange={(v) => set({ reduceMotion: v })} />
      </ScrollView>
    </Sheet>
  );
}

function VolumeRow({ label, value, onChange, disabled }) {
  const { c, s } = useTheme();
  return (
    <View style={[{ paddingVertical: 6 }, disabled && { opacity: 0.4 }]}>
      <Text style={s.prefLabel}>{label}</Text>
      <Slider
        style={{ height: 36 }}
        minimumValue={0}
        maximumValue={1}
        step={0.05}
        value={value}
        disabled={disabled}
        onSlidingComplete={onChange}
        minimumTrackTintColor={c.lagoon}
        maximumTrackTintColor={c.line}
        thumbTintColor={c.lagoon}
        accessibilityLabel={label}
      />
    </View>
  );
}

// ---------- Logo ----------
// Your logo file: assets/images/aohm-wordmark.png (transparent background). Its color is set here, so one file works everywhere.
const LOGO = require("./assets/images/aohm-wordmark.png");
const LOGO_RATIO = 1024 / 400;

function Logo({ width = 96, color = LIGHT.lagoon }) {
  return (
    <Image
      source={LOGO}
      style={{ width, height: width / LOGO_RATIO, tintColor: color }}
      resizeMode="contain"
      accessibilityLabel="aohm"
    />
  );
}

// ---------- Breathe ----------
// Each phase has its own orb color. [center, edge]
const ORB_LOOKS = {
  in: ["#9FE5DF", "#70D6CE"], // Breathe in: light aqua
  hold: ["#3FA9A8", "#238F91"], // Hold: deep lagoon
  out: ["#2A858B", "#176E76"], // Breathe out: deep teal
  rest: ["#C6DDD9", "#A9C9C3"], // Hold after exhale: muted sage
};
const ORB_KEYS = Object.keys(ORB_LOOKS);

// Soft wave layers around the orb: gently drifting shapes that overlap differently over time.
const WAVES = [
  { d: "M184.7 100.0 C185.0 102.5 185.3 105.0 185.4 107.5 C185.6 110.0 185.6 112.5 185.5 115.1 C185.4 117.6 185.2 120.2 184.8 122.7 C184.5 125.3 183.9 127.8 183.2 130.3 C182.5 132.8 181.6 135.2 180.6 137.6 C179.5 139.9 178.3 142.2 176.9 144.4 C175.5 146.6 174.0 148.7 172.3 150.6 C170.7 152.6 168.8 154.4 167.0 156.2 C165.1 157.9 163.1 159.5 161.0 161.0 C159.0 162.5 156.9 163.9 154.7 165.2 C152.6 166.6 150.4 167.8 148.3 168.9 C146.1 170.1 143.9 171.2 141.7 172.2 C139.5 173.3 137.3 174.3 135.1 175.3 C132.9 176.3 130.7 177.3 128.5 178.2 C126.2 179.2 124.0 180.1 121.7 181.0 C119.4 181.9 117.1 182.7 114.7 183.5 C112.4 184.3 109.9 185.0 107.5 185.6 C105.0 186.2 102.5 186.8 100.0 187.1 C97.5 187.5 94.9 187.8 92.3 187.9 C89.7 188.0 87.1 187.9 84.5 187.7 C82.0 187.5 79.4 187.1 76.8 186.5 C74.3 185.9 71.8 185.2 69.3 184.3 C66.9 183.4 64.5 182.3 62.2 181.1 C59.9 179.9 57.6 178.5 55.5 177.1 C53.3 175.6 51.3 174.0 49.3 172.4 C47.3 170.8 45.4 169.0 43.6 167.2 C41.8 165.4 40.1 163.5 38.4 161.6 C36.7 159.7 35.1 157.7 33.6 155.7 C32.1 153.7 30.7 151.6 29.3 149.5 C28.0 147.4 26.7 145.2 25.5 143.0 C24.3 140.8 23.2 138.6 22.2 136.3 C21.2 134.0 20.3 131.6 19.6 129.3 C18.8 126.9 18.2 124.5 17.7 122.0 C17.2 119.6 16.9 117.2 16.6 114.7 C16.4 112.2 16.4 109.8 16.4 107.3 C16.5 104.9 16.7 102.4 17.0 100.0 C17.3 97.6 17.7 95.2 18.2 92.8 C18.7 90.5 19.3 88.2 20.0 85.9 C20.6 83.6 21.4 81.4 22.1 79.1 C22.8 76.9 23.6 74.7 24.4 72.5 C25.2 70.3 26.1 68.1 26.9 65.9 C27.8 63.7 28.6 61.5 29.5 59.3 C30.4 57.1 31.3 54.9 32.3 52.6 C33.3 50.4 34.3 48.1 35.5 45.9 C36.6 43.6 37.8 41.3 39.1 39.1 C40.5 36.9 41.9 34.7 43.5 32.6 C45.0 30.5 46.7 28.5 48.6 26.5 C50.4 24.6 52.4 22.8 54.5 21.2 C56.6 19.5 58.8 18.0 61.1 16.7 C63.5 15.4 65.9 14.2 68.4 13.3 C70.9 12.4 73.6 11.6 76.2 11.1 C78.8 10.5 81.5 10.2 84.1 10.0 C86.8 9.8 89.5 9.9 92.1 10.0 C94.8 10.1 97.4 10.4 100.0 10.8 C102.6 11.2 105.2 11.8 107.7 12.4 C110.2 13.0 112.6 13.7 115.1 14.5 C117.5 15.2 119.9 16.1 122.3 17.0 C124.6 17.8 126.9 18.8 129.2 19.8 C131.5 20.8 133.7 21.8 135.9 23.0 C138.1 24.1 140.3 25.3 142.4 26.6 C144.5 27.8 146.6 29.2 148.6 30.6 C150.6 32.0 152.6 33.5 154.4 35.2 C156.3 36.8 158.1 38.5 159.8 40.2 C161.4 42.0 163.0 43.9 164.5 45.8 C166.0 47.8 167.4 49.8 168.7 51.9 C170.0 53.9 171.2 56.1 172.3 58.3 C173.4 60.4 174.4 62.6 175.3 64.9 C176.3 67.1 177.1 69.4 177.9 71.6 C178.7 73.9 179.4 76.2 180.1 78.5 C180.8 80.9 181.4 83.2 181.9 85.6 C182.5 87.9 183.0 90.3 183.5 92.7 C184.0 95.1 184.4 97.5 184.7 100.0Z", color: "#A8DCD7", opacity: 0.45, turn: 46000, dir: 1, morph: 9000, range: [0.9, 1.08] },
  { d: "M188.2 100.0 C188.2 102.6 188.0 105.1 187.6 107.7 C187.3 110.2 186.7 112.7 185.9 115.2 C185.2 117.6 184.2 120.0 183.2 122.3 C182.1 124.6 180.8 126.8 179.5 128.9 C178.2 131.1 176.7 133.1 175.2 135.1 C173.7 137.1 172.2 138.9 170.6 140.8 C169.0 142.6 167.4 144.3 165.8 146.1 C164.2 147.8 162.6 149.5 161.0 151.2 C159.5 152.9 157.9 154.6 156.3 156.3 C154.8 158.1 153.2 159.8 151.6 161.5 C150.0 163.3 148.4 165.0 146.8 166.8 C145.1 168.6 143.4 170.3 141.6 172.1 C139.8 173.8 137.9 175.5 135.9 177.1 C134.0 178.7 131.9 180.3 129.7 181.7 C127.5 183.1 125.3 184.4 122.9 185.5 C120.5 186.6 118.1 187.6 115.6 188.3 C113.1 189.1 110.5 189.7 107.9 190.1 C105.3 190.5 102.6 190.6 100.0 190.7 C97.4 190.7 94.7 190.5 92.1 190.1 C89.5 189.8 86.9 189.3 84.4 188.7 C81.8 188.1 79.3 187.3 76.8 186.4 C74.4 185.6 71.9 184.6 69.6 183.6 C67.2 182.6 64.8 181.5 62.5 180.3 C60.2 179.1 58.0 177.9 55.8 176.6 C53.6 175.3 51.4 173.9 49.2 172.5 C47.1 171.0 45.0 169.5 43.0 167.9 C41.0 166.3 39.1 164.5 37.3 162.7 C35.5 160.9 33.7 159.0 32.1 157.0 C30.5 155.0 29.0 152.8 27.7 150.6 C26.4 148.4 25.2 146.1 24.2 143.7 C23.2 141.4 22.4 138.9 21.7 136.5 C21.1 134.0 20.6 131.5 20.2 129.0 C19.8 126.6 19.6 124.0 19.5 121.6 C19.4 119.1 19.4 116.6 19.5 114.2 C19.5 111.8 19.7 109.4 19.8 107.0 C20.0 104.6 20.2 102.3 20.4 100.0 C20.5 97.7 20.7 95.4 20.9 93.1 C21.1 90.8 21.3 88.5 21.5 86.1 C21.6 83.8 21.8 81.5 22.0 79.1 C22.2 76.7 22.4 74.3 22.7 71.9 C23.0 69.4 23.4 67.0 23.9 64.5 C24.4 62.0 24.9 59.5 25.7 57.1 C26.5 54.7 27.3 52.2 28.4 49.9 C29.5 47.5 30.7 45.2 32.1 43.0 C33.5 40.9 35.1 38.8 36.8 36.8 C38.6 34.9 40.5 33.1 42.5 31.5 C44.5 29.8 46.7 28.4 48.9 27.0 C51.1 25.7 53.5 24.6 55.9 23.5 C58.2 22.5 60.7 21.6 63.1 20.9 C65.5 20.1 68.0 19.4 70.5 18.8 C72.9 18.2 75.4 17.7 77.8 17.3 C80.3 16.8 82.7 16.4 85.2 16.1 C87.7 15.7 90.1 15.4 92.6 15.1 C95.0 14.9 97.5 14.6 100.0 14.5 C102.5 14.3 105.0 14.2 107.5 14.2 C110.0 14.2 112.6 14.2 115.1 14.4 C117.6 14.6 120.2 14.9 122.7 15.3 C125.2 15.8 127.7 16.4 130.2 17.2 C132.6 17.9 135.0 18.8 137.4 19.9 C139.7 21.0 142.0 22.2 144.1 23.6 C146.3 25.0 148.4 26.5 150.3 28.1 C152.3 29.7 154.2 31.5 156.0 33.3 C157.8 35.1 159.4 37.0 161.0 39.0 C162.6 40.9 164.1 42.9 165.6 45.0 C167.0 47.0 168.4 49.1 169.7 51.2 C171.1 53.3 172.4 55.4 173.6 57.5 C174.9 59.6 176.1 61.8 177.3 64.0 C178.4 66.2 179.6 68.4 180.6 70.7 C181.7 72.9 182.7 75.2 183.6 77.6 C184.5 80.0 185.3 82.4 186.0 84.8 C186.6 87.3 187.2 89.8 187.6 92.3 C187.9 94.9 188.2 97.4 188.2 100.0Z", color: "#70D6CE", opacity: 0.32, turn: 61000, dir: -1, morph: 11500, range: [0.86, 1.12] },
  { d: "M186.4 100.0 C186.3 102.5 186.0 105.0 185.7 107.5 C185.4 110.0 185.0 112.5 184.5 114.9 C184.0 117.3 183.4 119.8 182.7 122.2 C182.0 124.6 181.3 126.9 180.4 129.3 C179.5 131.6 178.5 133.9 177.5 136.1 C176.4 138.4 175.2 140.6 173.9 142.7 C172.6 144.8 171.2 146.8 169.7 148.8 C168.2 150.8 166.6 152.7 164.9 154.4 C163.2 156.2 161.4 157.9 159.5 159.5 C157.7 161.1 155.7 162.6 153.7 164.0 C151.7 165.4 149.7 166.7 147.6 168.0 C145.5 169.2 143.4 170.4 141.3 171.5 C139.2 172.6 137.0 173.7 134.8 174.7 C132.7 175.7 130.5 176.7 128.2 177.6 C126.0 178.6 123.8 179.5 121.5 180.4 C119.3 181.2 117.0 182.1 114.6 182.9 C112.3 183.7 109.9 184.5 107.5 185.2 C105.0 186.0 102.5 186.6 100.0 187.2 C97.5 187.7 94.9 188.2 92.3 188.5 C89.6 188.8 87.0 188.9 84.3 188.9 C81.7 188.9 79.0 188.7 76.3 188.4 C73.7 188.0 71.0 187.4 68.5 186.7 C65.9 185.9 63.4 184.9 60.9 183.8 C58.5 182.6 56.2 181.2 54.0 179.7 C51.8 178.2 49.7 176.5 47.7 174.7 C45.7 172.9 43.9 170.9 42.2 168.9 C40.5 166.9 38.9 164.7 37.5 162.5 C36.0 160.3 34.7 158.1 33.5 155.8 C32.3 153.6 31.1 151.2 30.1 149.0 C29.0 146.7 28.1 144.3 27.2 142.0 C26.3 139.7 25.4 137.4 24.7 135.1 C23.9 132.8 23.1 130.5 22.5 128.2 C21.8 125.9 21.2 123.6 20.6 121.3 C20.0 118.9 19.5 116.6 19.1 114.3 C18.7 111.9 18.3 109.5 18.1 107.2 C17.8 104.8 17.7 102.4 17.6 100.0 C17.5 97.6 17.6 95.2 17.7 92.8 C17.9 90.4 18.1 88.0 18.5 85.6 C18.8 83.2 19.3 80.9 19.9 78.5 C20.4 76.2 21.1 73.9 21.9 71.6 C22.6 69.3 23.5 67.0 24.4 64.7 C25.3 62.5 26.3 60.3 27.4 58.1 C28.4 55.9 29.6 53.7 30.8 51.5 C32.0 49.4 33.2 47.2 34.6 45.1 C35.9 43.0 37.4 40.9 38.9 38.9 C40.4 36.8 42.0 34.8 43.7 32.9 C45.4 31.0 47.2 29.1 49.1 27.3 C51.0 25.5 53.0 23.8 55.1 22.2 C57.2 20.7 59.4 19.2 61.7 17.9 C64.0 16.6 66.4 15.5 68.9 14.6 C71.4 13.6 73.9 12.8 76.5 12.3 C79.1 11.7 81.7 11.3 84.3 11.1 C86.9 10.9 89.6 10.9 92.2 11.1 C94.8 11.2 97.4 11.6 100.0 12.0 C102.6 12.5 105.1 13.1 107.5 13.8 C110.0 14.5 112.4 15.3 114.8 16.2 C117.1 17.0 119.5 18.0 121.7 18.9 C124.0 19.9 126.2 20.9 128.4 21.9 C130.6 23.0 132.8 24.0 134.9 25.1 C137.1 26.2 139.2 27.2 141.4 28.4 C143.5 29.5 145.6 30.6 147.7 31.9 C149.8 33.1 151.9 34.3 154.0 35.7 C156.0 37.0 158.1 38.4 160.1 39.9 C162.1 41.4 164.0 43.0 165.9 44.7 C167.7 46.4 169.5 48.3 171.2 50.2 C172.8 52.1 174.4 54.1 175.8 56.2 C177.2 58.3 178.5 60.6 179.7 62.8 C180.8 65.1 181.8 67.5 182.7 69.9 C183.5 72.3 184.2 74.8 184.8 77.3 C185.3 79.8 185.8 82.3 186.1 84.8 C186.4 87.3 186.5 89.9 186.6 92.4 C186.6 95.0 186.6 97.5 186.4 100.0Z", color: "#38B6AC", opacity: 0.2, turn: 53000, dir: 1, morph: 13500, range: [0.82, 1.16] },
];

function OrbLayer({ id, colors }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={colors[0]} stopOpacity="1" />
          <Stop offset="0.75" stopColor={colors[1]} stopOpacity="1" />
          <Stop offset="0.92" stopColor={colors[1]} stopOpacity="0.9" />
          <Stop offset="1" stopColor={colors[1]} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx="50" cy="50" r="50" fill={`url(#${id})`} />
    </Svg>
  );
}

const WaveLayers = memo(function WaveLayers({ size, scale, reduceMotion }) {
  // Slow, endless drift and shape change, run by the phone's animation engine (no work for the app).
  const motion = useRef(WAVES.map(() => ({ turn: new Animated.Value(0), morph: new Animated.Value(0) }))).current;
  useEffect(() => {
    if (reduceMotion) return undefined;
    const loops = WAVES.map((w, i) =>
      Animated.parallel([
        Animated.loop(Animated.timing(motion[i].turn, { toValue: 1, duration: w.turn, easing: Easing.linear, useNativeDriver: true })),
        Animated.loop(
          Animated.sequence([
            Animated.timing(motion[i].morph, { toValue: 1, duration: w.morph / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(motion[i].morph, { toValue: 0, duration: w.morph / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ])
        ),
      ])
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [reduceMotion]);

  const styles = useMemo(
    () =>
      WAVES.map((w, i) => ({
        position: "absolute",
        width: size * 0.9,
        height: size * 0.9,
        transform: [
          { rotate: motion[i].turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${360 * w.dir}deg`] }) },
          { scaleX: motion[i].morph.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.04] }) },
          { scaleY: motion[i].morph.interpolate({ inputRange: [0, 1], outputRange: [1.03, 0.96] }) },
          { scale: reduceMotion ? 1 : scale.interpolate({ inputRange: [0.62, 1], outputRange: w.range }) },
        ],
      })),
    [size, scale, reduceMotion]
  );

  return WAVES.map((w, i) => (
    <Animated.View key={i} style={styles[i]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 200 200">
        <Defs>
          <RadialGradient id={`ommWave${i}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0.55" stopColor={w.color} stopOpacity="0" />
            <Stop offset="0.86" stopColor={w.color} stopOpacity={w.opacity} />
            <Stop offset="1" stopColor={w.color} stopOpacity={w.opacity * 0.6} />
          </RadialGradient>
        </Defs>
        <Path d={w.d} fill={`url(#ommWave${i})`} />
      </Svg>
    </Animated.View>
  ));
});

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const Bubble = memo(function Bubble({ size, scale, progress, tones, shimmer, showRing, reduceMotion, label, detail }) {
  const { c, s } = useTheme();
  const ringR = size / 2 - 3;
  const circ = 2 * Math.PI * ringR;
  const core = size * 0.66;
  // The orb follows the breath; its glow spreads out on the inhale and draws back in on the exhale.
  // With reduced motion, nothing moves: the glow brightens and softens instead.
  const { coreScale, glowScale, glowOpacity, ringOffset } = useMemo(
    () => ({
      coreScale: reduceMotion ? 1 : scale.interpolate({ inputRange: [0.62, 1], outputRange: [0.66, 1] }),
      glowScale: reduceMotion ? 1 : scale.interpolate({ inputRange: [0.62, 1], outputRange: [0.72, 1.1] }),
      glowOpacity: scale.interpolate({ inputRange: [0.62, 1], outputRange: [0.25, 0.85] }),
      ringOffset: progress.interpolate({ inputRange: [0, 1], outputRange: [circ, 0], extrapolate: "clamp" }),
    }),
    [scale, progress, reduceMotion, circ]
  );

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} accessible accessibilityLiveRegion="polite" accessibilityLabel={label}>
      <WaveLayers size={size} scale={scale} reduceMotion={reduceMotion} />
      <Animated.View style={{ position: "absolute", width: size * 0.9, height: size * 0.9, opacity: glowOpacity, transform: [{ scale: glowScale }] }}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="ommGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0.5" stopColor="#38B6AC" stopOpacity="0.3" />
              <Stop offset="0.8" stopColor="#38B6AC" stopOpacity="0.1" />
              <Stop offset="1" stopColor="#38B6AC" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="50" fill="url(#ommGlow)" />
        </Svg>
      </Animated.View>
      <Animated.View style={{ position: "absolute", width: core, height: core, transform: [{ scale: coreScale }] }}>
        {ORB_KEYS.map((k) => (
          <Animated.View key={k} style={[StyleSheet.absoluteFill, { opacity: tones[k] }]}>
            <OrbLayer id={`ommOrb_${k}`} colors={ORB_LOOKS[k]} />
          </Animated.View>
        ))}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: shimmer }]}>
          <Svg width="100%" height="100%" viewBox="0 0 100 100">
            <Defs>
              <RadialGradient id="ommShimmer" cx="38%" cy="34%" r="45%">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Circle cx="50" cy="50" r="48" fill="url(#ommShimmer)" />
          </Svg>
        </Animated.View>
      </Animated.View>
      {showRing && (
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <Circle cx={size / 2} cy={size / 2} r={ringR} stroke={c.line} strokeWidth={3} fill="none" />
            <AnimatedCircle
              cx={size / 2}
              cy={size / 2}
              r={ringR}
              stroke={c.teal}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${circ} ${circ}`}
              strokeDashoffset={ringOffset}
            />
          </G>
        </Svg>
      )}
      <View style={{ alignItems: "center", maxWidth: core * 0.62 }}>
        <Text style={s.phase} adjustsFontSizeToFit numberOfLines={1}>{label}</Text>
        {!!detail && <Text style={s.phaseDetail}>{detail}</Text>}
      </View>
    </View>
  );
});

function BreatheScreen({
  mode, session, defaultSession, phase, clock, note, finished, scale, progress, tones, shimmer, reduceMotion,
  onStart, onTogglePause, onEnd, onUseDefault, onMood, onDone, onSeeRhythm,
}) {
  const t = useT();
  const { c, s } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const size = Math.min(width - 56, 320);
  const inSession = mode === "running" || mode === "paused";

  if (mode === "finished" && finished) {
    return <DoneView finished={finished} onMood={onMood} onDone={onDone} onSeeRhythm={onSeeRhythm} />;
  }

  const p = phaseText(phase, t);
  const endless = session.duration === 0;
  const pace = session.rhythm === "free" ? t("rhythm.free.detail") : paceText(session.rhythm, t);

  return (
    <ScrollView contentContainerStyle={[s.page, s.center, { paddingTop: insets.top + 24, flexGrow: 1 }]} scrollEnabled={!inSession}>
      <Text style={s.breatheName}>{sessionName(session, t)}</Text>
      <Text style={s.pace}>{pace}</Text>

      <View style={{ marginVertical: 28 }}>
        <Bubble
          size={size}
          scale={scale}
          progress={progress}
          tones={tones}
          shimmer={shimmer}
          showRing={inSession && !endless}
          reduceMotion={reduceMotion}
          label={p.label}
          detail={p.detail}
        />
      </View>

      <Text style={s.timer}>{inSession || !endless ? fmt(clock) : t("endless")}</Text>

      {inSession ? (
        <>
          <Pressable
            onPress={onTogglePause}
            accessibilityRole="button"
            accessibilityLabel={mode === "paused" ? t("btn.resume") : t("btn.pause")}
            style={({ pressed }) => [s.pauseBtn, pressed && { opacity: 0.7 }]}
          >
            <Icon name={mode === "paused" ? "play" : "pause"} size={26} color={c.link} />
          </Pressable>
          <Pressable onPress={onEnd} accessibilityRole="button" hitSlop={10}>
            <Text style={[s.textLink, { marginTop: 16 }]}>{t("btn.end")}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <PrimaryButton label={t("btn.start")} onPress={onStart} />
          {!sameConfig(session, defaultSession) && (
            <Pressable onPress={onUseDefault} accessibilityRole="button" hitSlop={10}>
              <Text style={s.textLink}>{t("omm.useDefault", { name: sessionName(defaultSession, t) })}</Text>
            </Pressable>
          )}
        </>
      )}
      {!!note && <Text style={s.note}>{t(note)}</Text>}
    </ScrollView>
  );
}

function DoneView({ finished, onMood, onDone, onSeeRhythm }) {
  const t = useT();
  const { c, s } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView contentContainerStyle={[s.page, s.center, { paddingTop: insets.top + 28 }]}>
      <View style={s.checkCircle}>
        <Icon name="check" size={30} color={c.link} />
      </View>
      <Text style={s.doneTitle}>{t("done.title")}</Text>
      <Text style={s.doneText}>{t("done.subtitle")}</Text>

      <View style={s.statsCard}>
        <StatRow icon="clock" value={finished.mins} label={t("done.minutesLabel")} />
        {finished.bpm != null && <StatRow icon="wind" value={finished.bpm} label={t("done.bpm")} />}
      </View>

      <Text style={s.moodQ}>{t("mood.question")}</Text>
      <Text style={s.moodNotice}>{t("mood.notice")}</Text>
      <MoodGrid selected={finished.mood} onSelect={onMood} size={68} />
      {finished.mood ? (
        <Text style={[s.note, { color: c.link }]}>{t("mood.thanks")}</Text>
      ) : (
        <Pressable onPress={onDone} accessibilityRole="button" hitSlop={10}>
          <Text style={s.quietLink}>{t("mood.skip")}</Text>
        </Pressable>
      )}

      <View style={{ marginTop: 24, alignSelf: "stretch", alignItems: "center", gap: 6 }}>
        <PrimaryButton label={t("btn.backHome")} onPress={onDone} />
        <Pressable onPress={onSeeRhythm} accessibilityRole="button" hitSlop={10}>
          <Text style={s.textLink}>{t("btn.yourRhythm")}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function StatRow({ icon, value, label }) {
  const { c, s } = useTheme();
  return (
    <View style={s.statRow}>
      <Icon name={icon} size={22} color={c.slate} />
      <View>
        <Text style={s.statValue}>{value}</Text>
        <Text style={s.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

// ---------- Your Rhythm ----------
function RhythmScreen({ stats, moods }) {
  const t = useT();
  const { c, s } = useTheme();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState("week");
  const [monthOffset, setMonthOffset] = useState(0);
  const today = new Date();
  const todayKey = dayKey(today);
  const weekdays = t("weekdays");
  const months = t("months");
  const weekStart = t("weekStart");

  const last7 = [];
  for (let i = 6; i >= 0; i--) last7.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i));

  // The latest feeling for each day, preferring how people felt after a session.
  const moodByDay = {};
  moods.forEach((m) => {
    const k = dayKey(new Date(m.at));
    const prev = moodByDay[k];
    if (!prev || m.when === "after" || prev.when !== "after") moodByDay[k] = m;
  });
  const anyMood = last7.some((d) => moodByDay[dayKey(d)]);

  let cells = [];
  let title = "";
  if (view === "week") {
    cells = last7;
    title = t("progress.last7");
  } else {
    const first = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    cells = Array((first.getDay() - weekStart + 7) % 7).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(first.getFullYear(), first.getMonth(), d));
    title = `${months[first.getMonth()]} ${first.getFullYear()}`;
  }
  const headerDays = [0, 1, 2, 3, 4, 5, 6].map((i) => weekdays[(i + weekStart) % 7]);

  return (
    <ScrollView contentContainerStyle={[s.page, { paddingTop: insets.top + 12 }]}>
      <Text style={s.h1}>{t("progress.title")}</Text>

      <View style={s.streakCard}>
        <View style={s.row}>
          <Icon name="spark" size={22} color={c.link} />
          <Text style={s.streakTitle}>{stats.streak > 0 ? t("streak", { n: stats.streak }) : t("progress.noStreak")}</Text>
        </View>
        <Text style={s.streakSub}>{t("progress.every")}</Text>
        <Text style={s.streakMonth}>{t("progress.month", { n: stats.daysThisMonth })}</Text>
        <View style={s.totals}>
          <Text style={s.totalText}>{t("sessions", { n: stats.sessions })}</Text>
          <Text style={s.totalText}>{t("minutes", { n: stats.minutes })}</Text>
        </View>
      </View>

      <View style={s.feelCard}>
        <Text style={s.calTitle}>{t("rhythm.feelingTitle")}</Text>
        {anyMood ? (
          <View style={[s.row, { justifyContent: "space-between", marginTop: 14, gap: 0 }]}>
            {last7.map((d) => {
              const m = moodByDay[dayKey(d)];
              return (
                <View key={dayKey(d)} style={{ alignItems: "center", gap: 6, flex: 1 }}>
                  <Text style={s.weekday}>{weekdays[d.getDay()]}</Text>
                  {m ? (
                    <View style={[s.moodTile, { width: 38, height: 38, borderRadius: 19 }]} accessible accessibilityLabel={`${d.getDate()} ${months[d.getMonth()]}, ${t(`mood.${m.mood}`)}`}>
                      <Image source={MOOD_IMAGES[m.mood]} style={{ width: 34, height: 34 }} resizeMode="contain" />
                    </View>
                  ) : (
                    <View style={{ width: 38, height: 38, alignItems: "center", justifyContent: "center" }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.line }} />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={[s.streakSub, { marginTop: 8 }]}>{t("rhythm.noFeelings")}</Text>
        )}
      </View>

      <View style={s.segment}>
        {[["week", t("progress.week")], ["month", t("progress.monthTab")]].map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setView(key)}
            accessibilityRole="button"
            accessibilityState={{ selected: view === key }}
            style={[s.segmentItem, view === key && { backgroundColor: c.lagoon }]}
          >
            <Text style={[s.segmentText, view === key && { color: c.white, fontFamily: F.semibold }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.calHeader}>
        <Text style={s.calTitle}>{title}</Text>
        {view === "month" && (
          <View style={s.row}>
            <Pressable onPress={() => setMonthOffset(monthOffset - 1)} accessibilityLabel={t("progress.prevMonth")} hitSlop={10} style={s.arrow}>
              <Text style={s.arrowText}>‹</Text>
            </Pressable>
            <Pressable
              onPress={() => setMonthOffset(Math.min(0, monthOffset + 1))}
              accessibilityLabel={t("progress.nextMonth")}
              hitSlop={10}
              style={[s.arrow, monthOffset === 0 && { opacity: 0.3 }]}
              disabled={monthOffset === 0}
            >
              <Text style={s.arrowText}>›</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={s.calGrid}>
        {view === "month" &&
          headerDays.map((w, i) => (
            <View key={`h${i}`} style={s.calCell}>
              <Text style={s.weekday}>{w}</Text>
            </View>
          ))}
        {cells.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={s.calCell} />;
          const k = dayKey(d);
          const done = stats.days.has(k);
          const isToday = k === todayKey;
          const future = d > today;
          return (
            <View key={k} style={s.calCell}>
              {view === "week" && <Text style={[s.weekday, { marginBottom: 8 }]}>{weekdays[d.getDay()]}</Text>}
              <View
                style={[
                  s.dayCircle,
                  { backgroundColor: done ? c.lagoon : c.empty, opacity: future ? 0.45 : 1 },
                  isToday && !done && { borderWidth: 1.5, borderColor: c.lagoon },
                ]}
                accessible
                accessibilityLabel={`${d.getDate()} ${months[d.getMonth()]}, ${done ? t("progress.completed") : t("progress.notCompleted")}`}
              >
                <Text style={[s.dayNum, done && { color: c.white, fontFamily: F.semibold }]}>{d.getDate()}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={s.legend}>
        <View style={s.row}>
          <View style={[s.legendDot, { backgroundColor: c.lagoon }]} />
          <Text style={s.legendText}>{t("progress.completed")}</Text>
        </View>
        <View style={s.row}>
          <View style={[s.legendDot, { backgroundColor: c.empty }]} />
          <Text style={s.legendText}>{t("progress.notCompleted")}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function PrefRow({ label, value, onChange }) {
  const { c, s } = useTheme();
  return (
    <View style={s.prefRow}>
      <Text style={[s.prefLabel, { flexShrink: 1 }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: c.lagoon, false: c.line }}
        thumbColor={c.white}
      />
    </View>
  );
}

// ---------- Sheets ----------
function Sheet({ visible, onClose, children }) {
  const t = useT();
  const { s } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel={t("sheet.close")} />
      <View style={[s.sheet, { paddingBottom: 24 + insets.bottom }]}>
        <View style={s.handle} />
        {children}
      </View>
    </Modal>
  );
}

function PresetSheet({ preset, isDefault, onClose, onStart, onSetDefault }) {
  const t = useT();
  const { c, s, dark } = useTheme();
  if (!preset) return null;
  return (
    <Sheet visible={!!preset} onClose={onClose}>
      <View style={[s.sheetIcon, { backgroundColor: dark ? preset.bgDark : preset.bg }]}>
        <Icon name={preset.icon} size={30} color={c.link} />
      </View>
      <Text style={s.sheetTitle}>{t(`preset.${preset.id}.name`)}</Text>
      <Text style={s.sheetSub}>{t(`preset.${preset.id}.sub`)}</Text>

      <View style={s.detailList}>
        <Detail label={t("sheet.length")} value={durationLabel(preset.duration, t)} />
        <Detail label={t("sheet.breathing")} value={rhythmDetail(preset.rhythm, t)} />
        <Detail label={t("sheet.sound")} value={t(`sound.${preset.sound}`)} />
      </View>

      <PrimaryButton label={t("btn.start")} onPress={onStart} wide />
      <View style={{ height: 10 }} />
      {isDefault ? (
        <Text style={s.defaultConfirm}>{t("sheet.isDefault")}</Text>
      ) : (
        <SecondaryButton label={t("btn.setDefault")} onPress={onSetDefault} wide />
      )}
    </Sheet>
  );
}

const BUILDER_RHYTHMS = ["calm", "clear", "release", "even", "box", "sleep", "free"];

function BuilderSheet({ visible, initial, defaultSession, onClose, onStart, onSaveDefault }) {
  const t = useT();
  const { s } = useTheme();
  const pick = (cfg) => ({ duration: cfg.duration, rhythm: cfg.rhythm, sound: cfg.sound });
  const [draft, setDraft] = useState(pick(initial));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (visible) {
      setDraft(pick(initial));
      setSaved(false);
    }
  }, [visible]);

  const isDefault = sameConfig(defaultSession, customConfig(draft));
  const update = (patch) => {
    setDraft({ ...draft, ...patch });
    setSaved(false);
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: 18 }}>
        <View>
          <Text style={s.sheetTitle}>{t("custom.title")}</Text>
          <Text style={s.sheetSub}>{t("builder.sub")}</Text>
        </View>
        <ChipGroup label={t("builder.duration")}>
          {DURATIONS.map((d) => (
            <Chip key={d} label={durationLabel(d, t)} selected={draft.duration === d} onPress={() => update({ duration: d })} />
          ))}
        </ChipGroup>
        <ChipGroup label={t("builder.style")}>
          {BUILDER_RHYTHMS.map((key) => (
            <Chip key={key} label={t(`rhythm.${key}`)} selected={draft.rhythm === key} onPress={() => update({ rhythm: key })} />
          ))}
        </ChipGroup>
        <Text style={s.chipHint}>{rhythmDetail(draft.rhythm, t)}</Text>
        <ChipGroup label={t("sheet.sound")}>
          {SOUND_KEYS.map((key) => (
            <Chip key={key} label={t(`sound.${key}`)} selected={draft.sound === key} onPress={() => update({ sound: key })} />
          ))}
        </ChipGroup>
      </ScrollView>
      <View style={{ height: 18 }} />
      <PrimaryButton label={t("btn.start")} onPress={() => onStart(draft)} wide />
      <View style={{ height: 10 }} />
      {isDefault || saved ? (
        <Text style={s.defaultConfirm}>{t("builder.saved")}</Text>
      ) : (
        <SecondaryButton
          label={t("btn.saveDefault")}
          onPress={() => {
            onSaveDefault(draft);
            setSaved(true);
          }}
          wide
        />
      )}
    </Sheet>
  );
}

function Detail({ label, value }) {
  const { s } = useTheme();
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}

// ---------- Tab bar ----------
// Full color when selected, softer when not.
const NAV_ICONS = {
  home: require("./assets/images/nav-home.png"),
  omm: require("./assets/images/nav-breathe.png"),
  progress: require("./assets/images/nav-rhythm.png"),
};

const TabBar = memo(function TabBar({ tab, setTab, inSession }) {
  const t = useT();
  const { c, s } = useTheme();
  const insets = useSafeAreaInsets();
  const items = ["home", "omm", "progress"];
  return (
    <View style={[s.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {items.map((key) => {
        const active = tab === key;
        const color = active ? c.link : c.muted;
        return (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={key === "omm" && inSession ? t("tab.ommLive") : t(`tab.${key}`)}
            style={s.tabItem}
          >
            <View style={s.tabIcon}>
              <Image
                source={NAV_ICONS[key]}
                style={{ width: key === "omm" ? 34 : 28, height: key === "omm" ? 34 : 28, opacity: active ? 1 : 0.45 }}
                resizeMode="contain"
              />
              {key === "omm" && inSession && !active && <View style={s.liveDot} />}
            </View>
            <Text style={[s.tabLabel, { color, fontFamily: active ? F.semibold : F.regular }]} numberOfLines={1}>
              {t(`tab.${key}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

// ---------- Small components ----------
function PrimaryButton({ label, onPress, small, wide }) {
  const { s } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.primary,
        small && { minWidth: 130, paddingVertical: 14 },
        wide && { alignSelf: "stretch" },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text style={s.primaryText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress, small, wide }) {
  const { s } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.secondary,
        small && { minWidth: 130, paddingVertical: 14 },
        wide && { alignSelf: "stretch" },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={s.secondaryText}>{label}</Text>
    </Pressable>
  );
}

function ChipGroup({ label, children }) {
  const { s } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text style={s.groupLabel}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>
    </View>
  );
}

function Chip({ label, selected, onPress }) {
  const { c, s } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[s.chip, selected && { backgroundColor: c.lagoon, borderColor: c.lagoon }]}
    >
      <Text style={[s.chipText, selected && { color: c.white, fontFamily: F.semibold }]}>{label}</Text>
    </Pressable>
  );
}

function Icon({ name, size = 24, color }) {
  const theme = useTheme();
  const c = theme ? theme.c : LIGHT;
  color = color || c.link;
  const sw = 1.6;
  const common = { stroke: color, strokeWidth: sw, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" };
  let body = null;
  switch (name) {
    case "heart":
      body = <Path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z" {...common} />;
      break;
    case "target":
      body = (
        <>
          <Circle cx="12" cy="12" r="8.5" {...common} />
          <Circle cx="12" cy="12" r="4.5" {...common} />
          <Circle cx="12" cy="12" r="1.2" fill={color} />
        </>
      );
      break;
    case "leaf":
      body = (
        <>
          <Path d="M5 19C5 11 10 5.5 19.5 5c0 9.5-5.5 14-14.5 14z" {...common} />
          <Path d="M5 19l8.5-8.5" {...common} />
        </>
      );
      break;
    case "moon":
      body = <Path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z" {...common} />;
      break;
    case "sun":
      body = (
        <>
          <Circle cx="12" cy="12" r="4" {...common} />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
            const r = (a * Math.PI) / 180;
            return (
              <Line key={a} x1={12 + Math.cos(r) * 6.8} y1={12 + Math.sin(r) * 6.8} x2={12 + Math.cos(r) * 9} y2={12 + Math.sin(r) * 9} {...common} />
            );
          })}
        </>
      );
      break;
    case "waves":
      body = (
        <>
          <Path d="M3 9.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0" {...common} />
          <Path d="M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0" {...common} />
        </>
      );
      break;
    case "sliders":
      body = (
        <>
          <Line x1="4" y1="7" x2="20" y2="7" {...common} />
          <Line x1="4" y1="17" x2="20" y2="17" {...common} />
          <Circle cx="9" cy="7" r="2.3" fill={c.mist} stroke={color} strokeWidth={sw} />
          <Circle cx="15" cy="17" r="2.3" fill={c.mist} stroke={color} strokeWidth={sw} />
        </>
      );
      break;
    case "clock":
      body = (
        <>
          <Circle cx="12" cy="12" r="8.5" {...common} />
          <Path d="M12 7.5V12l3 2" {...common} />
        </>
      );
      break;
    case "chevron":
      body = <Path d="M9.5 6l6 6-6 6" {...common} strokeWidth={2} />;
      break;
    case "play":
      body = <Path d="M8 5.5l11 6.5-11 6.5z" fill={color} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />;
      break;
    case "gear":
      body = (
        <>
          <Circle cx="12" cy="12" r="3" {...common} />
          <Path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            {...common}
          />
        </>
      );
      break;
    case "check":
      body = <Path d="M5 12.5l4.5 4.5L19 7.5" {...common} strokeWidth={2.2} />;
      break;
    case "pause":
      body = (
        <>
          <Path d="M9 6v12" {...common} strokeWidth={2.4} />
          <Path d="M15 6v12" {...common} strokeWidth={2.4} />
        </>
      );
      break;
    case "wind":
      body = (
        <>
          <Path d="M3 9h11a3 3 0 1 0-3-3" {...common} />
          <Path d="M3 14h15a3 3 0 1 1-3 3" {...common} />
          <Path d="M3 19h6" {...common} />
        </>
      );
      break;
    case "spark":
      body = <Path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z" fill={color} stroke="none" />;
      break;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}

// ---------- Styles ----------
// The splash screen keeps its original look in both light and dark mode.
const styles = StyleSheet.create({
  splash: { backgroundColor: C.cloud, alignItems: "center", justifyContent: "center" },
});

function makeStyles(C) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.cloud },
    page: { padding: 24, paddingBottom: 40 },
    center: { alignItems: "center" },
    row: { flexDirection: "row", alignItems: "center", gap: 8 },
    h1: { fontFamily: F.bold, fontSize: 27, color: C.slate, marginTop: 12 },

    heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 30 },
    gearBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.glass, alignItems: "center", justifyContent: "center" },
    heroTitle: { fontFamily: F.bold, fontSize: 28, color: C.slate },
    heroLead: { fontFamily: F.regular, fontSize: 17, lineHeight: 24, color: C.heroText, marginTop: 8, maxWidth: 280 },
    panel: { backgroundColor: C.cloud, borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -24, paddingTop: 22, paddingHorizontal: 20 },

    moodGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 14 },
    moodItem: { width: "32%", alignItems: "center", gap: 6 },
    moodTile: { backgroundColor: C.moodTile, alignItems: "center", justifyContent: "center", borderWidth: 2.5, borderColor: "transparent", overflow: "hidden" },
    moodLabel: { fontFamily: F.regular, fontSize: 13, color: C.slate },

    recCard: { marginTop: 4, borderRadius: 22, overflow: "hidden", padding: 20, minHeight: 150, backgroundColor: C.mist },
    recLabel: { fontFamily: F.medium, fontSize: 13, color: C.slate },
    recName: { fontFamily: F.semibold, fontSize: 26, color: C.slate, marginTop: 10 },
    recMeta: { fontFamily: F.regular, fontSize: 14, color: C.heroText, marginTop: 6 },
    recPlay: {
      position: "absolute", right: 18, bottom: 18, width: 50, height: 50, borderRadius: 25,
      backgroundColor: C.lagoon, alignItems: "center", justifyContent: "center", paddingLeft: 3,
    },

    grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 11 },
    presetCard: { width: "48.5%", minHeight: 146, borderRadius: 18, padding: 15, paddingTop: 16 },
    presetTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
    badge: {
      fontFamily: F.semibold, fontSize: 10, color: C.link, backgroundColor: C.card,
      paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, overflow: "hidden",
    },
    presetName: { fontFamily: F.semibold, fontSize: 17, color: C.slate },
    presetSub: { fontFamily: F.regular, fontSize: 13, color: C.muted, marginTop: 4 },
    presetBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: 14 },
    presetMins: { fontFamily: F.semibold, fontSize: 13, color: C.link },

    sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 28, marginBottom: 14 },
    sectionTitle: { fontFamily: F.bold, fontSize: 22, color: C.slate },
    seeAll: { fontFamily: F.medium, fontSize: 14, color: C.link },
    soundCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.soft, borderRadius: 18, padding: 10 },
    soundRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.soft, borderRadius: 16, padding: 8, paddingRight: 14 },
    soundName: { fontFamily: F.semibold, fontSize: 16, color: C.slate },
    soundDesc: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.muted },
    soundMins: { fontFamily: F.semibold, fontSize: 13, color: C.link, marginTop: 2 },
    playDot: { position: "absolute", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", paddingLeft: 2 },
    customCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: C.mist, borderRadius: 18, padding: 18, marginTop: 24 },
    customTitle: { fontFamily: F.semibold, fontSize: 17, color: C.slate },
    customSub: { fontFamily: F.regular, fontSize: 13, color: C.muted },

    breatheName: { fontFamily: F.semibold, fontSize: 24, color: C.slate, textAlign: "center" },
    pace: { fontFamily: F.regular, fontSize: 15, color: C.muted, marginTop: 6, letterSpacing: 1 },
    phase: {
      fontFamily: F.semibold, fontSize: 22, color: "#FFFFFF",
      textShadowColor: "rgba(23,66,71,0.55)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8,
    },
    phaseDetail: {
      fontFamily: F.regular, fontSize: 14, color: "#FFFFFF", marginTop: 4,
      textShadowColor: "rgba(23,66,71,0.55)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
    },
    timer: { fontFamily: F.medium, fontSize: 30, color: C.slate, fontVariant: ["tabular-nums"], marginBottom: 20 },
    pauseBtn: {
      width: 68, height: 68, borderRadius: 34, borderWidth: 1.5, borderColor: C.link,
      alignItems: "center", justifyContent: "center",
    },
    textLink: { fontFamily: F.medium, fontSize: 14, color: C.link, marginTop: 14, textAlign: "center" },
    quietLink: { fontFamily: F.regular, fontSize: 13, color: C.muted, marginTop: 14, textAlign: "center", textDecorationLine: "underline" },
    note: { fontFamily: F.regular, fontSize: 13, color: C.muted, marginTop: 16, textAlign: "center", maxWidth: 300 },

    checkCircle: { width: 76, height: 76, borderRadius: 38, backgroundColor: C.mist, alignItems: "center", justifyContent: "center" },
    doneTitle: { fontFamily: F.bold, fontSize: 28, color: C.slate, marginTop: 18 },
    doneText: { fontFamily: F.regular, fontSize: 15, color: C.muted, marginTop: 6, textAlign: "center" },
    statsCard: { alignSelf: "stretch", backgroundColor: C.soft, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 6, marginTop: 22 },
    statRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10 },
    statValue: { fontFamily: F.semibold, fontSize: 17, color: C.slate },
    statLabel: { fontFamily: F.regular, fontSize: 12, color: C.muted },
    moodQ: { fontFamily: F.semibold, fontSize: 20, color: C.slate, marginTop: 28 },
    moodNotice: { fontFamily: F.regular, fontSize: 13, color: C.muted, marginTop: 4, marginBottom: 16, textAlign: "center" },

    streakCard: { backgroundColor: C.mist, borderRadius: 20, padding: 22, marginTop: 22, gap: 8 },
    streakTitle: { fontFamily: F.bold, fontSize: 23, color: C.link },
    streakSub: { fontFamily: F.regular, fontSize: 13, color: C.muted },
    streakMonth: { fontFamily: F.medium, fontSize: 15, color: C.slate, marginTop: 10 },
    totals: { flexDirection: "row", gap: 18, marginTop: 4 },
    totalText: { fontFamily: F.regular, fontSize: 13, color: C.muted },
    feelCard: { backgroundColor: C.soft, borderRadius: 20, padding: 18, marginTop: 14 },
    segment: { flexDirection: "row", backgroundColor: C.mist, borderRadius: 14, padding: 4, marginTop: 22 },
    segmentItem: { flex: 1, borderRadius: 11, paddingVertical: 10, alignItems: "center" },
    segmentText: { fontFamily: F.medium, fontSize: 15, color: C.slate },
    calHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 26, marginBottom: 14 },
    calTitle: { fontFamily: F.semibold, fontSize: 18, color: C.slate },
    arrow: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.mist, alignItems: "center", justifyContent: "center" },
    arrowText: { fontFamily: F.semibold, fontSize: 20, color: C.link, marginTop: -2 },
    calGrid: { flexDirection: "row", flexWrap: "wrap" },
    calCell: { width: `${100 / 7}%`, alignItems: "center", marginBottom: 10 },
    weekday: { fontFamily: F.semibold, fontSize: 12, color: C.muted },
    dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    dayNum: { fontFamily: F.regular, fontSize: 13, color: C.slate },
    legend: { flexDirection: "row", justifyContent: "center", gap: 28, marginTop: 10 },
    legendDot: { width: 12, height: 12, borderRadius: 6 },
    legendText: { fontFamily: F.regular, fontSize: 12, color: C.muted },

    prefRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, gap: 12 },
    prefLabel: { fontFamily: F.regular, fontSize: 15, color: C.slate },

    backdrop: { flex: 1, backgroundColor: C.backdrop },
    popWrap: { flex: 1, backgroundColor: C.backdrop, alignItems: "center", justifyContent: "center", padding: 20 },
    popCard: { alignSelf: "stretch", maxWidth: 420, backgroundColor: C.cloud, borderRadius: 26, padding: 22, paddingTop: 26 },
    sheet: { backgroundColor: C.cloud, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 24, paddingTop: 12 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: "center", marginBottom: 18 },
    sheetIcon: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 14 },
    sheetTitle: { fontFamily: F.bold, fontSize: 22, color: C.slate },
    sheetSub: { fontFamily: F.regular, fontSize: 14, color: C.muted, marginTop: 6 },
    detailList: { backgroundColor: C.mist, borderRadius: 16, paddingHorizontal: 16, marginVertical: 20 },
    detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 13, gap: 16 },
    detailLabel: { fontFamily: F.regular, fontSize: 14, color: C.muted },
    detailValue: { fontFamily: F.semibold, fontSize: 14, color: C.slate, flexShrink: 1, textAlign: "right" },
    defaultConfirm: { fontFamily: F.medium, fontSize: 14, color: C.link, textAlign: "center", paddingVertical: 14 },
    groupLabel: { fontFamily: F.semibold, fontSize: 14, color: C.slate },
    chipHint: { fontFamily: F.regular, fontSize: 12, color: C.muted, marginTop: -8 },
    chip: { borderWidth: 1, borderColor: C.line, backgroundColor: C.card, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 15 },
    chipText: { fontFamily: F.regular, fontSize: 14, color: C.slate },

    primary: { backgroundColor: C.lagoon, borderRadius: 999, paddingVertical: 17, paddingHorizontal: 36, minWidth: 208, alignItems: "center" },
    primaryText: { fontFamily: F.semibold, fontSize: 17, color: "#FFFFFF" },
    secondary: { borderWidth: 1.5, borderColor: C.link, borderRadius: 999, paddingVertical: 15, paddingHorizontal: 36, minWidth: 208, alignItems: "center" },
    secondaryText: { fontFamily: F.semibold, fontSize: 16, color: C.link },

    tabBar: { flexDirection: "row", backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 },
    tabItem: { flex: 1, alignItems: "center", gap: 4 },
    tabIcon: { height: 32, justifyContent: "center", alignItems: "center" },
    tabLabel: { fontSize: 12 },
    liveDot: { position: "absolute", top: 0, right: -8, width: 7, height: 7, borderRadius: 4, backgroundColor: C.teal },
  });
}

const THEMES = {
  light: { c: LIGHT, s: makeStyles(LIGHT), dark: false },
  dark: { c: DARK, s: makeStyles(DARK), dark: true },
};
