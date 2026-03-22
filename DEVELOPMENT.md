# Руководство по разработке

## Требования к окружению

### Node.js и npm

| Компонент | Минимальная версия | Рекомендуемая версия |
|-----------|-------------------|---------------------|
| Node.js   | 20.19.4           | 22.x LTS            |
| npm       | 10.x              | 10.x                |

**Важно:** React Native 0.83 и Expo SDK 55 требуют Node.js 20+. При использовании более старой версии будут предупреждения `EBADENGINE`, и некоторые функции могут работать некорректно.

#### Проверка версий

```bash
node -v   # должно быть v20.19.4 или выше
npm -v    # должно быть 10.x
```

#### Установка/обновление Node.js

**Windows (nvm-windows):**

```powershell
# Установить nvm-windows: https://github.com/coreybutler/nvm-windows/releases
nvm install 22
nvm use 22
```

> **Примечание:** nvm-windows не читает `.nvmrc` автоматически. Версия указана в файле для справки; переключать нужно вручную командой `nvm use 22`.

**Или скачать установщик:** https://nodejs.org/en/download/

### Android SDK

| Компонент | Версия |
|-----------|--------|
| Android SDK Platform | 35 (Android 15) |
| Android SDK Build-Tools | 35.0.0 |
| Android SDK Platform-Tools | последняя |
| Android Emulator | последняя |

#### Ссылки для ручной загрузки

**Куда ставить (Windows):** лучше всего в папку по умолчанию:

```
%LOCALAPPDATA%\Android\Sdk   →   C:\Users\<ваш_логин>\AppData\Local\Android\Sdk
```

Так делают Android Studio и большинство туториалов: не нужны права администратора, путь без пробелов и кириллицы, бэкапы профиля пользователя захватывают SDK. Если поставите в другое место (например, `D:\Android\Sdk`) — задайте переменную `ANDROID_HOME` на эту папку.

Скачайте и распакуйте компоненты в выбранную папку (например, в `%LOCALAPPDATA%\Android\Sdk`).

| Что скачать | Ссылка |
|-------------|--------|
| **Command-line tools** (нужны первыми — из них ставятся остальные пакеты) | https://developer.android.com/studio#command-line-tools-only — на странице блок «Command line tools only», выберите Windows. Прямая ссылка (актуальна на момент написания): `https://dl.google.com/android/repository/commandlinetools-win-11391160_latest.zip` |
| **Android Studio** (вместо всего по отдельности: SDK + эмулятор + менеджер пакетов) | https://developer.android.com/studio |
| **JDK 17** (если нет своей Java) | https://adoptium.net/ или https://www.oracle.com/java/technologies/downloads/#java17 |

**Command-line tools — куда распаковывать:**

1. Создайте папку SDK, если её нет: `%LOCALAPPDATA%\Android\Sdk`.
2. Распакуйте скачанный ZIP. Внутри будет папка `cmdline-tools` с подпапками `bin`, `lib` и т.д.
3. Положите **содержимое** этой папки в `%ANDROID_HOME%\cmdline-tools\latest\`:
   - итог: `...\Sdk\cmdline-tools\latest\bin\sdkmanager.bat` (и рядом `bin`, `lib`, `source.properties`).

Пример: если распаковали в `Загрузки\cmdline-tools\`, скопируйте всё из `cmdline-tools\` (папки `bin`, `lib` и файлы) в `C:\Users\<ваш_логин>\AppData\Local\Android\Sdk\cmdline-tools\latest\`.

Затем в терминале (нужен **JDK 17 или 21**, иначе sdkmanager выдаст ошибку версии Java):

```bash
# Один раз принять лицензии (на вопросы отвечать y)
sdkmanager --licenses

# Установить компоненты для сборки и эмулятора
sdkmanager "platforms;android-35" "build-tools;35.0.0" "platform-tools" "emulator"
```

Перед этим задайте в системе (или в этом окне терминала) `ANDROID_HOME` и добавьте в PATH `%ANDROID_HOME%\cmdline-tools\latest\bin`, чтобы команда `sdkmanager` находилась.

Альтернатива — прямые ссылки на отдельные ZIP (без sdkmanager): https://androidsdkmanager.azurewebsites.net/ (выбрать компоненты и платформу Windows).

#### Переменные окружения (Windows)

```
ANDROID_HOME = C:\Users\<user>\AppData\Local\Android\Sdk
PATH += %ANDROID_HOME%\platform-tools
PATH += %ANDROID_HOME%\emulator
```

### Java

| Компонент | Версия |
|-----------|--------|
| JDK | 17 или 21 |

Expo/React Native используют Gradle, который требует JDK 17+.

```bash
java -version   # должно показать 17.x или 21.x
```

---

## Зависимости проекта

### Основные (dependencies)

| Пакет | Версия | Назначение |
|-------|--------|------------|
| expo | ~55.0.6 | Платформа |
| react | 19.2.0 | UI-библиотека |
| react-native | 0.83.2 | Мобильный фреймворк |
| expo-location | ^55.1.2 | Геолокация |
| expo-task-manager | ^55.0.9 | Фоновые задачи |
| expo-osm-sdk | ^2.1.1 | Карты OpenStreetMap (MapLibre) |
| expo-dev-client | ^55.0.16 | Development build |
| @react-navigation/native | ^7.1.33 | Навигация |
| @react-navigation/bottom-tabs | ^7.15.5 | Нижние вкладки |
| @react-navigation/native-stack | ^7.14.5 | Stack-навигация |
| @react-native-async-storage/async-storage | ^3.0.1 | Локальное хранилище |
| react-native-screens | ^4.24.0 | Нативные экраны |
| react-native-safe-area-context | ^5.7.0 | Safe area |

### Разработка (devDependencies)

| Пакет | Версия | Назначение |
|-------|--------|------------|
| typescript | ~5.9.2 | Типизация |
| @types/react | ~19.2.2 | Типы для React |

---

## Сборка

### Локальная сборка (Android)

Требует установленного Android SDK и эмулятора/устройства.

```bash
cd veloped

# Установить зависимости
npm install

# Запустить сборку и установить на устройство/эмулятор
npx expo run:android

# Release APK (вшитый бандл, не dev-сборка)
npm run android:release
```

При первом запуске будет создана папка `android/` с нативным кодом.

Release-вариант кладёт APK в `android/app/build/outputs/apk/release/`. Для публикации в Google Play обычно нужен AAB (`eas build --profile production`).

**Почему локальный prebuild мог падать:** в `app.json` в `plugins` нужно указывать плагин как **`expo-osm-sdk/plugin`**, а не `expo-osm-sdk`. У пакета плагин лежит в `expo-plugin.js` и экспортируется по подпути `/plugin`; основной экспорт — это компоненты карты, и при попытке загрузить его как config plugin возникает ошибка (`Unexpected token 'typeof'`). С правильным путём `expo-osm-sdk/plugin` и локальный `npx expo prebuild`, и EAS Build работают.

### Облачная сборка (EAS Build)

Не требует локального Android SDK. Сборка идёт на серверах Expo, APK скачиваешь по ссылке.

**Что нужно:**

| Шаг | Действие |
|-----|----------|
| 1 | Аккаунт на [expo.dev](https://expo.dev) (бесплатная регистрация). |
| 2 | Установить EAS CLI: `npm install -g eas-cli` |
| 3 | Войти: `eas login` (откроется браузер или ввод логина/пароля в терминале). |
| 4 | В папке проекта запустить сборку (см. команды ниже). |

В проекте уже есть `eas.json`: `development` (dev client + APK), `preview` и **`release-apk`** (обычный APK без dev client), `production` (AAB).

```bash
cd veloped

# Обычный APK без dev build (рекомендуется для «просто APK»)
eas build --profile release-apk --platform android

# APK для внутреннего теста (аналогично по сути preview)
eas build --profile preview --platform android

# Development-сборка с dev-клиентом
eas build --profile development --platform android
```

После сборки ссылку на APK покажет консоль; все сборки также видны в https://expo.dev → твой проект → Builds.

---

## Запуск

### Development build

После `npx expo run:android` приложение установится на устройство/эмулятор и запустится Metro bundler.

Для последующих запусков (без пересборки нативного кода):

```bash
npx expo start --dev-client
```

### Expo Go (ограничения)

expo-osm-sdk **не работает** в Expo Go — требуется development build. Фоновый трекинг также ограничен.

---

## Отладка

### Логи

```bash
# Логи Metro bundler — в терминале после expo start
# Логи Android (все)
adb logcat

# Логи только от приложения
adb logcat *:S ReactNative:V ReactNativeJS:V
```

### Flipper

Expo 55 поддерживает Flipper для отладки. Установить с https://fbflipper.com/

---

## Обновление зависимостей

```bash
# Проверить обновления
npx expo install --check

# Обновить до совместимых версий
npx expo install --fix

# Обновить Expo SDK (major)
npx expo install expo@latest
npx expo install --fix
```

---

## Известные проблемы

### EBADENGINE warnings

Если видите предупреждения о несовместимой версии Node.js — обновите Node.js до 20.19.4+.

### expo-osm-sdk: «does not contain a valid config plugin» / «Unexpected token 'typeof'»

В `app.json` в массиве `plugins` должно быть **`"expo-osm-sdk/plugin"`**, а не `"expo-osm-sdk"`. Иначе prebuild и EAS Build падают при загрузке конфига.

### expo-osm-sdk не отображает карту

Убедитесь, что используете development build (`npx expo run:android`), а не Expo Go.

### Foreground service не запускается

Проверьте, что в `app.json` настроены плагины:
- `expo-location` с `isAndroidForegroundServiceEnabled: true`
- Разрешения `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`

После изменения `app.json` требуется пересборка: `npx expo run:android`.
