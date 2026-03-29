# Жизненный цикл приложения (временная диаграмма)

Упрощённая временная диаграмма: от холодного старта до трекинга и обратно. Не каждый внутренний вызов ОС, а **логический порядок** для стека Expo + React Native + Hermes + фоновая геолокация (`expo-location`, `expo-task-manager`).

---

## Последовательность (sequence)

```mermaid
sequenceDiagram
  autonumber
  actor User as Пользователь
  participant Sys as Android (система)
  participant App as Процесс / Application
  participant Act as MainActivity
  participant JS as Hermes + JS (React)
  participant Loc as Нативный expo-location

  User->>Sys: Запуск иконки
  Sys->>App: Создание процесса, onCreate()
  App->>Act: MainActivity onCreate → onStart → onResume
  Act->>JS: Поднять RN, загрузить бандл
  JS->>JS: registerRootComponent, App, import locationTask → defineTask
  JS->>JS: Навигация, PermissionGate, экран карты

  User->>JS: Старт записи поездки
  JS->>Loc: watchPositionAsync (поток в UI)
  JS->>Loc: startLocationUpdatesAsync + foregroundService
  Loc->>Sys: Foreground service + уведомление
  Sys-->>User: Уведомление «Запись маршрута…»

  User->>Sys: Home / другой экран (приложение в фоне)
  Sys->>Act: onPause → onStop
  Note over JS: AppState: background
  Loc->>Sys: Продолжение обновлений геолокации (FGS)
  Sys->>Loc: Новые точки GPS
  Loc->>JS: Колбэк фоновой задачи TaskManager
  JS->>JS: AsyncStorage: дописать координаты

  User->>Sys: Возврат в приложение
  Sys->>Act: onStart → onResume
  Note over JS: AppState: active, UI синхронизируется с состоянием / storage

  User->>JS: Стоп записи
  JS->>Loc: stopLocationUpdatesAsync, снять подписки
  Loc->>Sys: Остановка FGS / уведомление
  JS->>JS: Состояние finished, при необходимости дочитать трек из AsyncStorage
```

---

## Состояния на оси времени

```mermaid
stateDiagram-v2
  direction LR
  [*] --> Процесс_не_запущен
  Процесс_не_запущен --> UI_на_переднем_плане: cold start
  UI_на_переднем_плане --> Трекинг_FG: старт поездки
  Трекинг_FG --> Трекинг_фон: Home / блокировка\n(FGS активен)
  Трекинг_фон --> Трекинг_FG: возврат в приложение
  Трекинг_FG --> UI_после_поездки: стоп
  Трекинг_фон --> UI_после_поездки: стоп
  UI_после_поездки --> UI_на_переднем_плане: сброс / новая поездка
  UI_на_переднем_плане --> Процесс_не_запущен: система убила процесс\n(опционально)
  Трекинг_фон --> Процесс_не_запущен: агрессивное убийство\n(редко при активном FGS)
```

**Смысл:** жизненный цикл **процесса** и **Activity** пересекается с **сессией трекинга**: приложение может быть в фоне по Activity, но запись маршрута продолжается за счёт **foreground service** и колбэка фоновой задачи, пока пользователь не остановит трекинг.
