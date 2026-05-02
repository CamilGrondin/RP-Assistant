# RP Assistant

Un plugin BetterDiscord pensé pour le RolePlay, avec un tableau de bord intégré pour gérer ton personnage, tes scènes, tes rappels, tes notes et tes messages directement dans Discord.

<ins style="font-size:large;">__IMPORTANT__</ins>: Ce plugin fonctionne avec BetterDiscord et s’utilise dans le client Discord modifié. Les données sont enregistrées localement par conversation ou salon.

## Fonctionnalités clés
- Tableau de bord personnage avec nom, avatar, statut, humeur, lieu et état
- Gestion de scène en cours avec titre, lieu et description
- Rappels et notes rapides, chacun saisi sur une ligne
- Rédaction de messages RP avec envoi immédiat ou programmé
- Programmation d’envoi par délai en minutes ou à une heure précise, par exemple `20:30`
- Découpage automatique des longs messages en plusieurs parties compatibles Discord
- Génération de liens de recherche GIF à partir du message saisi, avec option directe et option NSFW
- Fiches de personnage structurées, réutilisables et réimportables depuis le chat
- Validation d’une fiche via une réaction ✅ sur ton propre message
- Interface traduite en français et en anglais

## Comment l’utiliser
1. Place `RPAssistant.plugin.js` dans le dossier des plugins BetterDiscord.
2. Active le plugin depuis BetterDiscord.
3. Clique sur le bouton 🎭 pour ouvrir le panneau latéral.
4. Utilise les raccourcis pour ouvrir le tableau de bord, le composeur de message ou la fiche de personnage.
5. Renseigne ton profil, puis enregistre ou envoie directement depuis l’interface.

## Messages RP
Le bloc Message permet de rédiger un texte, de l’envoyer tout de suite ou de le programmer plus tard. Tu peux saisir un délai en minutes ou une heure au format `HH:MM`.

Si ton message dépasse la limite de Discord, RP Assistant le découpe automatiquement en plusieurs envois.

## Fiches de personnage
Le bloc Fiche sert à générer une fiche structurée à partir du tableau de bord, l’envoyer dans la conversation ou réimporter une fiche copiée/collée dans le panneau.

Si tu réagis avec ✅ à ta propre fiche dans le salon, RP Assistant peut la relire et mettre à jour le tableau de bord automatiquement.

## GIF et recherche visuelle
Quand tu rédiges un message, le plugin propose des liens de recherche GIF basés sur le texte saisi. Les liens ouvrent une recherche Google Images filtrée sur les images animées, avec une alternative directe et une variante NSFW.

## Langue
Le plugin propose un réglage de langue simple:
- Français
- English

Le changement de langue met à jour immédiatement les libellés de l’interface, les notifications et la recherche GIF.

## Stockage
- Les profils sont stockés localement dans BetterDiscord.
- Les données sont séparées par conversation ou salon.
- Aucune clé API n’est requise.

## Aperçu rapide
RP Assistant est pensé pour garder l’essentiel du RP sous la main: profil, scène, message, fiche et notes, sans quitter Discord.