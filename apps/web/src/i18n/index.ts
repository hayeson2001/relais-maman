import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import fr from './fr.json'
import gej from './gej.json'

/**
 * Le français est complet. Le mina (gej) dispose de la MÊME structure de clés, vide :
 * aucune traduction n'est fournie ni présentée comme validée. Une langue n'est proposée
 * que si l'API la déclare disponible (registre des langues, validé par des locutrices).
 */
void i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, gej: { translation: gej } },
  lng: 'fr',
  fallbackLng: 'fr',
  returnEmptyString: false,
  interpolation: { escapeValue: false },
})

export default i18n
