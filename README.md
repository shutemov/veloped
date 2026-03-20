# Veloped

Личный трекер велопоездок — запись маршрутов, дистанции и времени в пути без облака и соцсетей.

> **Требования к окружению:** Node.js 20.19.4+, npm 10+, Android SDK 35. Подробнее в [DEVELOPMENT.md](DEVELOPMENT.md).

## Возможности MVP

- Карта OpenStreetMap (expo-osm-sdk)
- Запись трека в реальном времени с foreground service
- Отображение маршрута (полилайн) и текущего местоположения
- Расчёт дистанции (Haversine) и времени в пути
- Сохранение поездок в локальное хранилище (AsyncStorage)
- История поездок с детальным просмотром
- Работа при выключенном экране (фоновая геолокация)

## Технологии

- **Expo** (managed workflow с dev build)
- **expo-osm-sdk** — карты OpenStreetMap на базе MapLibre
- **expo-location** — геолокация и фоновый трекинг
- **expo-task-manager** — фоновые задачи
- **React Navigation** — навигация (bottom tabs + stack)
- **AsyncStorage** — локальное хранение данных

## Установка

```bash
cd veloped
npm install
```

## Запуск

Для полноценной работы (карты, фоновый трекинг) требуется **development build**, а не Expo Go.

### Development build (рекомендуется)

```bash
# Установить EAS CLI (один раз)
npm install -g eas-cli

# Создать dev build для Android
npx expo run:android

# Или через EAS Build (облачная сборка)
eas build --profile development --platform android
```

### Expo Go (ограниченная функциональность)

expo-osm-sdk не работает в Expo Go. Для тестирования в Expo Go можно временно заменить карту на react-native-maps, но фоновый трекинг всё равно будет ограничен.

## Структура проекта

```
src/
  components/       # UI-компоненты (StatsBar, TrackingButton, RideCard, PermissionGate)
  hooks/            # Хуки (useTracking, useRides)
  navigation/       # Навигация (bottom tabs + stack)
  screens/          # Экраны (MapScreen, HistoryScreen, RideDetailScreen)
  tasks/            # Фоновые задачи (locationTask)
  types/            # TypeScript-типы (Coordinate, Ride, TrackingState)
  utils/            # Утилиты (haversine, formatters)
```

## Разрешения (Android)

- `ACCESS_FINE_LOCATION` — точная геолокация
- `ACCESS_BACKGROUND_LOCATION` — геолокация при выключенном экране
- `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_LOCATION` — постоянное уведомление во время трекинга

## Что дальше (вне MVP)

- Пауза / продолжение поездки
- Экспорт / импорт GPX
- Офлайн-карты (кэширование тайлов)
- Базовая статистика (неделя / месяц)
- Кастомизация уведомления foreground service
