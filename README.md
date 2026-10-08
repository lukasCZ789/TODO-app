# TODO-app (Expo)

Mobilní seznam úkolů v React Native / Expo.

## Funkce

- Přidání úkolu (prázdný text se nepřidá)
- Seznam úkolů
- Označení jako hotové / nedokončené
- Smazání úkolu

## Spuštění

```bash
npm install
npm start
```

Naskenuj QR kód v aplikaci **Expo Go** (Android / iOS) nebo stiskni `w` pro web.

```bash
npm run android
npm run web
```

## Náhled „telefonu“ vedle Cursoru (live)

1. `npm.cmd run preview` (nebo `npm start` → klávesa **w**)
2. V Cursoru: **Ctrl+Shift+P** → **Simple Browser: Show** → adresa `http://localhost:19006`
3. Panel přetáhni vedle chatu — po uložení `App.tsx` se náhled sám obnoví (Fast Refresh)

Na webu je úzký rámeček telefonu; v Android emulátoru / Expo Go běží stejná appka na celé obrazovce.
