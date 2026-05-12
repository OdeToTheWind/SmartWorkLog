import React, { createContext, useContext, useState, useEffect } from "react";

const STRINGS = {
  en: {
    dashboard: "Dashboard", tasks: "Tasks", people: "People", notifications: "Notifications",
    leave: "Leave", auditLog: "Audit Log", leaderboard: "Leaderboard", dailyUpdate: "Daily Update",
    welcome: "Welcome back!", signIn: "Sign in", newCompany: "New company", email: "Email",
    password: "Password", logout: "Logout", criticalTask: "CRITICAL TASK",
    acknowledged: "Acknowledged", openTasks: "Open tasks", critical: "Critical",
    updatesToday: "Updates today", avgMood: "Avg mood", myTasks: "My tasks",
    submitUpdate: "Submit & AI parse", howWasDay: "How was your day", mood: "Mood",
    blocker: "Blocker (optional)", language: "Language", profile: "Profile",
    history: "History", company: "Company", attachments: "Attachments",
  },
  hi: { dashboard: "डैशबोर्ड", tasks: "कार्य", people: "लोग", notifications: "सूचनाएँ",
    leave: "अवकाश", auditLog: "ऑडिट लॉग", leaderboard: "लीडरबोर्ड", dailyUpdate: "दैनिक अपडेट",
    welcome: "वापसी पर स्वागत है!", signIn: "साइन इन", newCompany: "नई कंपनी", email: "ईमेल",
    password: "पासवर्ड", logout: "लॉग आउट", criticalTask: "अति महत्वपूर्ण कार्य",
    acknowledged: "स्वीकार किया", openTasks: "खुले कार्य", critical: "अति महत्वपूर्ण",
    updatesToday: "आज के अपडेट", avgMood: "औसत मूड", myTasks: "मेरे कार्य",
    submitUpdate: "AI से सबमिट करें", howWasDay: "आपका दिन कैसा था", mood: "मूड",
    blocker: "बाधा (वैकल्पिक)", language: "भाषा", profile: "प्रोफ़ाइल",
    history: "इतिहास", company: "कंपनी", attachments: "अनुलग्नक" },
  ar: { dashboard: "لوحة التحكم", tasks: "المهام", people: "الأشخاص", notifications: "الإشعارات",
    leave: "الإجازة", auditLog: "سجل التدقيق", leaderboard: "المتصدرون", dailyUpdate: "التحديث اليومي",
    welcome: "أهلاً بعودتك!", signIn: "تسجيل الدخول", newCompany: "شركة جديدة", email: "البريد",
    password: "كلمة المرور", logout: "خروج", criticalTask: "مهمة حرجة",
    acknowledged: "تم الإقرار", openTasks: "المهام المفتوحة", critical: "حرج",
    updatesToday: "تحديثات اليوم", avgMood: "متوسط المزاج", myTasks: "مهامي",
    submitUpdate: "إرسال", howWasDay: "كيف كان يومك", mood: "المزاج",
    blocker: "عائق (اختياري)", language: "اللغة", profile: "الملف الشخصي",
    history: "السجل", company: "الشركة", attachments: "المرفقات" },
  ur: { dashboard: "ڈیش بورڈ", tasks: "ٹاسکس", people: "لوگ", notifications: "اطلاعات",
    leave: "چھٹی", auditLog: "آڈٹ لاگ", leaderboard: "لیڈربورڈ", dailyUpdate: "روزانہ اپ ڈیٹ",
    welcome: "خوش آمدید!", signIn: "سائن ان", newCompany: "نئی کمپنی", email: "ای میل",
    password: "پاس ورڈ", logout: "لاگ آؤٹ", criticalTask: "اہم ٹاسک", acknowledged: "تسلیم",
    openTasks: "کھلے ٹاسکس", critical: "اہم", updatesToday: "آج کے اپڈیٹس", avgMood: "اوسط مزاج",
    myTasks: "میرے ٹاسکس", submitUpdate: "جمع کریں", howWasDay: "آپ کا دن کیسا تھا",
    mood: "مزاج", blocker: "رکاوٹ", language: "زبان", profile: "پروفائل",
    history: "تاریخ", company: "کمپنی", attachments: "منسلکات" },
  bn: { dashboard: "ড্যাশবোর্ড", tasks: "কাজ", people: "মানুষ", notifications: "বিজ্ঞপ্তি",
    leave: "ছুটি", auditLog: "অডিট লগ", leaderboard: "লিডারবোর্ড", dailyUpdate: "দৈনিক আপডেট",
    welcome: "স্বাগতম!", signIn: "সাইন ইন", newCompany: "নতুন কোম্পানি", email: "ইমেইল",
    password: "পাসওয়ার্ড", logout: "লগ আউট", criticalTask: "গুরুত্বপূর্ণ", acknowledged: "স্বীকার",
    openTasks: "খোলা কাজ", critical: "জরুরি", updatesToday: "আজকের আপডেট", avgMood: "গড় মেজাজ",
    myTasks: "আমার কাজ", submitUpdate: "জমা দিন", howWasDay: "আপনার দিন কেমন ছিল",
    mood: "মেজাজ", blocker: "বাধা", language: "ভাষা", profile: "প্রোফাইল",
    history: "ইতিহাস", company: "কোম্পানি", attachments: "সংযুক্তি" },
  fr: { dashboard: "Tableau de bord", tasks: "Tâches", people: "Personnes", notifications: "Notifications",
    leave: "Congé", auditLog: "Journal d'audit", leaderboard: "Classement", dailyUpdate: "Mise à jour quotidienne",
    welcome: "Bon retour !", signIn: "Connexion", newCompany: "Nouvelle entreprise", email: "Email",
    password: "Mot de passe", logout: "Déconnexion", criticalTask: "TÂCHE CRITIQUE",
    acknowledged: "Accusé de réception", openTasks: "Tâches ouvertes", critical: "Critique",
    updatesToday: "Mises à jour", avgMood: "Humeur moy.", myTasks: "Mes tâches",
    submitUpdate: "Envoyer", howWasDay: "Comment était votre journée", mood: "Humeur",
    blocker: "Blocage", language: "Langue", profile: "Profil",
    history: "Historique", company: "Entreprise", attachments: "Pièces jointes" },
  sw: { dashboard: "Dashibodi", tasks: "Kazi", people: "Watu", notifications: "Arifa",
    leave: "Likizo", auditLog: "Kumbukumbu", leaderboard: "Ubao", dailyUpdate: "Sasisho la Kila Siku",
    welcome: "Karibu tena!", signIn: "Ingia", newCompany: "Kampuni mpya", email: "Barua pepe",
    password: "Nenosiri", logout: "Toka", criticalTask: "KAZI MUHIMU SANA",
    acknowledged: "Imethibitishwa", openTasks: "Kazi wazi", critical: "Muhimu",
    updatesToday: "Sasisho leo", avgMood: "Hali wastani", myTasks: "Kazi zangu",
    submitUpdate: "Wasilisha", howWasDay: "Siku yako ilikuwaje", mood: "Hali",
    blocker: "Kizuizi", language: "Lugha", profile: "Wasifu",
    history: "Historia", company: "Kampuni", attachments: "Viambatisho" },
};

const RTL = new Set(["ar", "ur"]);
export const LANGUAGES = [
  { code: "en", label: "English" }, { code: "hi", label: "हिन्दी" },
  { code: "ar", label: "العربية" }, { code: "ur", label: "اردو" },
  { code: "bn", label: "বাংলা" }, { code: "fr", label: "Français" },
  { code: "sw", label: "Kiswahili" },
];

const I18nCtx = createContext(null);

export const I18nProvider = ({ children }) => {
  const [lang, setLang] = useState(() => localStorage.getItem("worklog_lang") || "en");
  useEffect(() => {
    localStorage.setItem("worklog_lang", lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL.has(lang) ? "rtl" : "ltr";
  }, [lang]);
  const t = (k) => (STRINGS[lang] && STRINGS[lang][k]) || STRINGS.en[k] || k;
  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>;
};

export const useI18n = () => useContext(I18nCtx);
