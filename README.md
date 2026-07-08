# Калькулятор российских облигаций

Онлайн-калькулятор российских облигаций на React + TypeScript. Приложение задумано как статический browser-only SPA без собственного backend. Данные будут браться из MOEX ISS API.

## Требования

- Node.js
- npm

Текущая версия окружения, на котором проект уже запускался:

```bash
node --version
npm --version
```

## Установка зависимостей

```bash
npm install
```

## Dev server

```bash
npm run dev
```

После запуска Vite покажет локальный URL, обычно:

```text
http://localhost:5173/
```

Если нужно явно слушать только локальный интерфейс:

```bash
npm run dev -- --host 127.0.0.1
```

## Тесты

Однократный запуск тестов:

```bash
npm run test
```

Watch-режим для разработки:

```bash
npm run test:watch
```

Integration-тесты с реальным MOEX ISS API запускаются отдельно:

```bash
npm run test:integration
```

Они требуют доступа к сети и могут падать при недоступности или изменениях MOEX API. Обычный `npm run test` сеть не использует.

## Production build

```bash
npm run build
```

Сборка складывается в `dist/`.

## Preview production build

Сначала нужно собрать проект:

```bash
npm run build
```

Потом запустить preview:

```bash
npm run preview
```

## Static hosting

Приложение собирается как browser-only SPA:

- build command: `npm run build`
- output directory: `dist`
- preview command: `npm run preview`

Для Cloudflare Pages, Vercel Static, Netlify или похожего static hosting нужно отдавать `dist/` как статическую директорию. Так как в приложении есть прямые URL вида `/bond/:secid`, настройте rewrite fallback на `index.html`, чтобы обновление страницы и прямое открытие карточки облигации работали без 404.

Для GitHub Pages на project site дополнительно потребуется задать `base` в `vite.config.ts` под имя репозитория и учесть тот же SPA fallback. В текущей конфигурации `base` не задан, поэтому сборка рассчитана на hosting от корня домена.

## Полезные документы

- [План проекта](./docs/PROJECT_PLAN.md)
- [Пример экрана поиска](./raw/search.png)
- [Пример экрана калькулятора](./raw/calc.png)
