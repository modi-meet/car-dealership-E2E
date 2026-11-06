import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import hi from './hi.json'

const saved = (() => {
  try {
    return localStorage.getItem('lang')
  } catch {
    return null
  }
})()

i18n.use(initReactI18next).init({
  resources: { en: { t: en }, hi: { t: hi } },
  defaultNS: 't',
  lng: saved === 'hi' ? 'hi' : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export function setLang(lang: 'en' | 'hi') {
  i18n.changeLanguage(lang)
  document.documentElement.lang = lang
  try {
    localStorage.setItem('lang', lang)
  } catch {
    // private mode, fine
  }
}

document.documentElement.lang = i18n.language

export default i18n
