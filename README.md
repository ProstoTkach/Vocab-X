# VocabX

Вебзастосунок для вивчення іншомовної лексики з інтервальним повторенням (FSRS-6 + рівні формату вправ).

> Статус: **фаза A, етап A4+** — одна велика колода за ступенем забування без денних лімітів,
> повторення в оболонці застосунку (свайпи мишею й дотиком, перевертання туди й назад), онбординг,
> вбудовані колоди (англійська B1, українська), панель зсуву часу, оновлений дизайн.

## Запуск

Потрібні Node.js ≥ 22 і pnpm (`npm i -g pnpm`).

```bash
pnpm install
pnpm dev           # http://localhost:3000 → /uk
pnpm typecheck     # TypeScript у всіх пакетах
pnpm lint          # ESLint, зокрема власні правила дизайн-системи та i18n
pnpm test          # Vitest (ядро, дані, теми, переклади, правила лінтера)
pnpm build         # production-збірка Next.js
pnpm e2e           # Playwright: мобільний (390×844) і десктопний (1280×800) в'юпорти
pnpm screenshots   # скріншоти /dev/ui і сторінок у 5 в'юпортах × 5 тем → apps/web/screenshots
```

Перед першим `pnpm e2e`: `pnpm --filter @vocabx/web exec playwright install chromium`.

Сторінка `/uk/dev/ui` показує всі компоненти в усіх темах. Вона доступна в `pnpm dev`;
у production-збірці — лише з `NEXT_PUBLIC_ENABLE_DEV_UI=1`.

## Структура

```
apps/web                 Next.js (App Router), Tailwind CSS v4, next-intl, Radix UI
  messages/<locale>/     переклади інтерфейсу (ICU), один JSON на простір імен
  src/app/[locale]/      маршрути; (app)/ — сторінки в оболонці, dev/ui — галерея компонентів
  src/components/ui/     Button, Card, Dialog, Tabs, Switch, ProgressBar, Toast, Avatar, Badge, Tooltip
  src/components/shell/  нижня панель (телефон), бічна панель (md+), колонка прогресу (lg+)
  src/themes/            реєстр тем і токени кольорів
  src/i18n/              реєстр локалей, маршрутизація, завантаження повідомлень
packages/core            чисті функції: FSRS-6, XP, стопка, оцінювання відповіді, журнал подій,
                         інтерфейси репозиторіїв, Clock/Rng, параметри моделі (src/config)
packages/content         реєстр мов, мовні адаптери, вбудовані колоди (src/decks/*.json)
packages/data            реалізації репозиторіїв: LocalStorageRepo (фаза A)
tools/eslint-plugin-vocabx  правила: design-tokens, no-jsx-literals
reference/               еталонні файли, з яких перенесено ядро
```

`core` не залежить від браузера чи Node: той самий код працюватиме на сервері у фазі B.

## Ключові рішення

- **Журнал подій — джерело істини.** Стан картки відтворюється з подій функцією `replayCard`;
  випадковий зсув інтервалу береться з `Rng`, засіяного `id` події, тож відтворення детерміноване.
- **Параметри моделі** (`w₀…w₂₀`, `ρ`, `τ⁰`, ліміти, пороги оцінювання, XP) — лише в
  `packages/core/src/config/params.ts`.
- **localStorage**: ключі `vocabx:v1:*`, `schemaVersion` з міграціями, компактний журнал,
  `StorageQuotaError` при переповненні, експорт/імпорт JSON з відкатом. UI звертається до даних
  лише через `useRepos()`; лінтер забороняє `localStorage` у компонентах.
- **Теми — набори семантичних токенів.** Стандартну палітру Tailwind вимкнено (`--color-*: initial`),
  тож `bg-white` чи `text-gray-900` не існують; правило `vocabx/design-tokens` додатково ловить
  сирі кольори, `dark:` і фізичні напрямки (`ml-`, `left-`, `text-right`). Тема застосовується
  inline-скриптом у `<head>` до гідратації — без «блимання».
- **Жодних рядків у JSX.** Правило `vocabx/no-jsx-literals` ловить текст і текстові атрибути
  (`aria-label`, `alt`, `placeholder`…). Тест перевіряє, що всі локалі мають однакові ключі й
  коректний ICU з тими самими аргументами.
- **Доступність.** Контраст токенів кожної теми (WCAG AA) перевіряє unit-тест; сторінки — axe у
  Playwright. Цілі натискання ≥ 44 px, логічні властивості для RTL.

## Як додати тему

1. Файл `apps/web/src/themes/<id>.ts` з усіма токенами з `COLOR_TOKENS` і полем `unlock`
   (`free` | `level:N` | `achievement:id` | `purchase:sku`).
2. Запис у масиві `THEMES` у `apps/web/src/themes/registry.ts`.
3. Назва теми — ключ `<id>` у `messages/<locale>/themes.json` для кожної локалі.

`pnpm test` перевірить контраст усіх пар токенів.

## Як додати мову інтерфейсу

1. Папка `apps/web/messages/<code>/` з тими самими JSON-файлами, що й `uk/`.
2. Запис у `LOCALES` у `apps/web/src/i18n/locales.ts` (`dir: 'rtl'` для арабської, івриту тощо;
   `script` обирає резервний стек шрифтів).

`pnpm test` перевірить, що ключі й аргументи збігаються з українською локаллю.

## Як додати вбудовану колоду

1. JSON-файл у `packages/content/src/decks/` (формат — `DeckFile` у `decks/index.ts`): слова з частиною
   мови, перекладами за кодом мови та прикладами.
2. Запис у `DECK_FILES`. `pnpm test` перевірить унікальність лем, наявність перекладів і те, що
   приклад містить слово.

Переклади нових слів, які додає користувач, підказують безкоштовні онлайн-джерела: MyMemory
(переклади) та Wiktionary (частина мови, приклади) — з тайм-аутом, кешем і ручним введенням як
запасним варіантом (`apps/web/src/lib/lexicon`).

## Як додати формат вправи

1. Рендерер у `apps/web/src/components/review/formats/`: компонент, що отримує `FormatProps`
   (`card`, `side`, `typing`, `onTypedSubmit`…) і малює лише вміст картки, та об'єкт
   `FormatRenderer` (`format`, `supportsTyping`, `frontText`).
2. Запис у масиві в `formats/registry.ts`. Оболонка `ReviewSession` (прогрес, оцінки, свайпи,
   клавіші, скасування, підсумок) не змінюється.

## Демонстрація інтервального повторення

Налаштування → «Режим розробника» (або Ctrl+Shift+D) відкриває панель зсуву часу: «+1 день»,
«+7 днів». Рухається лише годинник застосунку; збережені дані не змінюються.

## Як додати мову, що вивчається

1. `packages/content/src/adapters/<code>.ts` — адаптер (`createBasicAdapter` з правилами нормалізації).
2. Один запис у `LANGUAGES` у `packages/content/src/languages.ts`.
