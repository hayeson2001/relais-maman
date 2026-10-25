# Démonstration (données fictives)

`npm run demo:reset` recrée les données et affiche les comptes. Utilisez **un navigateur ou une fenêtre privée par rôle** pour vérifier la séparation des comptes. La démonstration n'existe qu'en `APP_ENV` local, test ou demo.

| Rôle | Compte | Identifiant | Secret |
|---|---|---|---|
| Maman | Ama K. (Koffi, 4 mois) | `RM-AMAK-4M2X` | code `482915` |
| Maman | Abiba T. (déplacement) | `RM-ABBT-7P3Q` | code `739264` |
| Maman | Akou D. (frais, équipe Ouest) | `RM-AKUD-9R4W` | code `615083` |
| Maman | Yawa (à activer) | `RM-YAWA-2K8N` | code d'activation `DEMO-YAWA` |
| Agente | Esi (équipe Est) | `agent.esi` | `demo-agent-2026` |
| Agent | Kodjo (équipe Est) | `agent.kodjo` | `demo-agent-2026` |
| Agente | Afi (équipe Ouest) | `agent.ouest` | `demo-agent-2026` |
| Structure | Centre A (habilitée) | `ref.centre-a` | `demo-ref-2026` |
| Structure | Centre B (non habilité) | `ref.centre-b` | `demo-ref-2026` |
| Administration | Admin | `admin.demo` | `demo-admin-2026` + `npm run demo:totp -w apps/api` |

## Scénario d'Ama

1. **Ama** (`/connexion`) voit son rendez-vous et celui de Koffi, touche « Signaler un obstacle », choisit « L'horaire » et son rendez-vous, écrit « Je vends au marché, je ne suis pas disponible avant 15 heures », donne son accord, relit, envoie : « Transmis au service ».
2. **Esi** (`/equipe`) ouvre la demande (Ama voit « Consulté par un agent »), prend en charge, enregistre l'action, propose un créneau à **15 h 30** au Centre A dans trois jours.
3. **Ama** accepte le créneau. **Esi** enregistre « Action convenue ».
4. **Centre A** (`/equipe`, `ref.centre-a`) confirme le créneau, **sans voir le message d'Ama**.
5. Après le rendez-vous : **Esi** passe en « soin à confirmer » (ou le worker le fait), **Ama** déclare le soin reçu, **Centre A** confirme le soin (registre du centre). Ama voit « Soin vérifié ».
6. **Admin** consulte les indicateurs : soin déclaré et soin vérifié comptés séparément.

À vérifier aussi : Afi (équipe Ouest) ne voit ni Ama ni Abiba ; le Centre B ne voit pas le dossier d'Ama et ne peut rien confirmer ; Abiba (déplacement) et Akou (frais « à vérifier ») illustrent les autres obstacles ; Yawa s'active avec son code.

Ce scénario est automatisé : `apps/api/test/scenario.test.ts` (API) et `apps/web/e2e/scenario.spec.ts` (navigateurs, écran 360 px).
