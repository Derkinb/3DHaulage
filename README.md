# 3D Haulage Dashboard

Nowoczesny, responsywny panel webowy przeznaczony do współpracy z tą samą bazą Supabase, z której korzysta aplikacja KierowcaApp. Aplikacja została zaprojektowana z myślą o pracy na komputerach, tabletach oraz telefonach – automatycznie dopasowuje układ, zapewniając szybki dostęp do najważniejszych danych operacyjnych.

## Funkcje

- 🔐 logowanie przez Supabase z wykorzystaniem tych samych kont, co w KierowcaApp;
- 📊 przejrzysty dashboard z kluczowymi wskaźnikami (zlecenia, pojazdy, alerty);
- 🚚 zarządzanie zleceniami wraz z filtrowaniem, wyszukiwaniem i szybką zmianą statusów;
- 🚛 moduł floty prezentujący dostępność pojazdów, przebieg, paliwo i serwis;
- 👷 sekcja kierowców z kontaktem, trasami i historią szkoleń;
- 🔄 subskrypcje realtime Supabase (gotowe do wykorzystania) dla natychmiastowych aktualizacji.

## Wymagania

- Node.js 18+
- dostępy Supabase (URL oraz anon key) używane w projekcie KierowcaApp.

## Konfiguracja

1. Utwórz plik `.env` w katalogu głównym projektu:

   ```bash
   VITE_SUPABASE_URL="https://twoj-projekt.supabase.co"
   VITE_SUPABASE_ANON_KEY="twój-klucz-anon"
   ```

2. Zadbaj, aby w Supabase istniały tabele wykorzystywane przez panel (np. `deliveries`, `vehicles`, `drivers`) oraz aby użytkownicy mieli do nich prawa odczytu/zapisu poprzez RLS.

## Instalacja zależności

```bash
npm install
```

> Jeśli środowisko nie ma dostępu do rejestru npm, polecenie może wymagać powtórzenia po przywróceniu łączności.

## Uruchomienie w trybie deweloperskim

```bash
npm run dev
```

Aplikacja będzie dostępna pod adresem `http://localhost:5173`.

## Budowanie wersji produkcyjnej

```bash
npm run build
```

## Styl kodu i linting

```bash
npm run lint
```

## Struktura katalogów

```
src/
├─ components/      # współdzielone komponenty UI
├─ contexts/        # kontekst Supabase i provider
├─ hooks/           # logika komunikacji z Supabase i realtime
├─ lib/             # konfiguracja klienta Supabase
├─ pages/           # widoki routingu
├─ styles/          # konfiguracja Tailwind oraz style globalne
└─ env.d.ts         # deklaracje zmiennych środowiskowych
```

## Dalsze kroki

- Rozszerz reguły RLS, aby umożliwić edycję danych z poziomu panelu.
- Włącz kanały realtime w Supabase (np. `deliveries`) i wykorzystaj hook `useRealtimeSubscription`, aby jeszcze szybciej odświeżać dane.
- Dodaj testy end-to-end dla najważniejszych scenariuszy biznesowych.
