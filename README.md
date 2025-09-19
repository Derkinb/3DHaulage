# 3D Haulage Driver Portal

Nowoczesny, responsywny panel webowy działający na wspólnej bazie Supabase wykorzystywanej przez aplikację KierowcaApp. Projekt
udostępnia komplet narzędzi dla dyspozytorów i kierowców – od monitoringu floty po codzienną checklistę, która automatycznie
zamienia się w raport PDF zapisany w firmowym Google Workspace Drive. Aplikację można uruchomić jako PWA lub zainstalować na
Androidzie dzięki Capacitorowi.

## Kluczowe funkcje

- 🔐 logowanie i ochrona tras za pomocą Supabase Auth (te same konta co w KierowcaApp);
- 📊 dashboard z KPI, zleceniami, flotą i kierowcami w układzie przyjaznym na desktopie i mobile;
- 👤 widok „Mój profil” dla kierowcy z przydziałem na dziś, historią raportów i checklistą startową;
- 📝 rejestrowanie stanu licznika, poziomu paliwa oraz zaznaczanie kluczowych elementów checklisty;
- 📄 generowanie raportu PDF i automatyczne przesyłanie go do wskazanego folderu Google Drive;
- 📱 oficjalne wsparcie dla pakowania w aplikację Android (Capacitor) z możliwością dystrybucji w firmowym MDM lub Google Play.

## Wymagania

- Node.js 18+
- Konto Supabase z dostępem do projektu używanego przez KierowcaApp
- Uprawnienia do zarządzania Google Cloud / Google Workspace (utworzenie usługi i dostęp do Drive)
- Java 17 oraz Android Studio (jeśli planujesz budowę aplikacji Android)

## Szybki start (web)

1. Skopiuj plik `.env.example` do `.env` i uzupełnij dane:
   ```bash
   cp .env.example .env
   ```
   ```env
   VITE_SUPABASE_URL="https://twoj-projekt.supabase.co"
   VITE_SUPABASE_ANON_KEY="twój-klucz-anon"
   VITE_GOOGLE_DRIVE_PARENT_FOLDER_ID="id-folderu-na-dysku"
   VITE_CHECKLIST_TEMPLATE_ID="opcjonalny-id-szablonu"
   ```
2. Zainstaluj zależności (patrz sekcja „Instalacja zależności”).
3. Uruchom środowisko deweloperskie: `npm run dev` – aplikacja wystartuje pod `http://localhost:5173`.

## Konfiguracja Supabase – krok po kroku

### 1. Tabele i widoki

Minimalny zestaw struktur wymagany przez panel (dopasuj do własnego schematu – to bezpieczne przykłady startowe):

```sql
-- Profil kierowcy powiązany z kontem auth.users
create table if not exists driver_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  driver_id uuid references drivers(id),
  full_name text not null,
  phone text,
  license_number text,
  avatar_url text,
  home_depot text,
  created_at timestamptz default now()
);

create or replace view driver_profiles_view as
select id, user_id, driver_id, full_name, phone, license_number, avatar_url, home_depot
from driver_profiles;

-- Dzisiejsze przydziały (powiąż z własnymi tabelami tras/pojazdów)
create or replace view driver_assignments_view as
select
  da.id,
  da.driver_id,
  da.assignment_date,
  da.shift_start,
  da.shift_end,
  dep.name as depot_name,
  dest.name as destination_name,
  r.name as route_name,
  v.id as vehicle_id,
  v.registration,
  v.make,
  v.model
from driver_assignments da
  left join depots dep on dep.id = da.depot_id
  left join depots dest on dest.id = da.destination_id
  left join routes r on r.id = da.route_id
  left join vehicles v on v.id = da.vehicle_id;

-- Raport checklisty przechowujący wynik i link do PDF
create table if not exists driver_daily_reports (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references driver_assignments(id) on delete cascade,
  driver_id uuid references driver_profiles(driver_id),
  start_odometer numeric,
  fuel_level numeric,
  checklist_state jsonb,
  notes text,
  drive_file_id text,
  drive_file_url text,
  completed_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists driver_daily_reports_assignment_idx on driver_daily_reports(assignment_id);
```

### 2. Reguły RLS

Włącz RLS i dodaj polityki pozwalające kierowcy widzieć tylko własne dane (przykład):

```sql
alter table driver_profiles enable row level security;
alter table driver_daily_reports enable row level security;

create policy "own profile" on driver_profiles
  for select using (auth.uid() = user_id);

create policy "manage own reports" on driver_daily_reports
  for select using (auth.uid() in (
    select user_id from driver_profiles where driver_profiles.driver_id = driver_daily_reports.driver_id
  ))
  with check (auth.uid() in (
    select user_id from driver_profiles where driver_profiles.driver_id = driver_daily_reports.driver_id
  ));
```

Dopasuj polityki do własnego schematu – powyższe są wzorcem startowym.

### 3. Funkcja Edge `generate-checklist-report`

1. Utwórz w Supabase folder `functions/generate-checklist-report` i dodaj plik `index.ts` podobny do poniższego:
   ```ts
   import { serve } from 'http://deno.land/std@0.177.1/http/server.ts'
   import PdfKit from 'npm:pdfkit';
   import { google } from 'npm:googleapis';
   import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

   serve(async req => {
     const { report_id, driver_id, assignment_id, google_drive_parent_id, checklist_template_id } = await req.json();

     const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
     const { data: report } = await supabase
       .from('driver_daily_reports')
       .select('*, driver:driver_profiles(full_name), assignment:driver_assignments_view(*)')
       .eq('id', report_id)
       .single();

     const doc = new PdfKit({ size: 'A4' });
     const buffers: Uint8Array[] = [];
     doc.text(`Raport checklisty – ${report.driver.full_name}`);
     doc.text(`Data: ${new Date(report.completed_at).toLocaleString('pl-PL')}`);
     doc.text(`Odo start: ${report.start_odometer ?? '-'} km, paliwo: ${report.fuel_level ?? '-'}%`);
     Object.entries(report.checklist_state || {}).forEach(([label, value]) => {
       doc.text(`${label}: ${value ? 'OK' : 'Wymaga uwagi'}`);
     });
     doc.end();
     for await (const chunk of doc) buffers.push(chunk as Uint8Array);
     const pdfBuffer = Buffer.concat(buffers);

     const auth = new google.auth.JWT({
       email: Deno.env.get('GOOGLE_CLIENT_EMAIL'),
       key: Deno.env.get('GOOGLE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
       scopes: ['https://www.googleapis.com/auth/drive.file']
     });
     const drive = google.drive({ version: 'v3', auth });
     const file = await drive.files.create({
       requestBody: {
         name: `Checklist-${report.driver.full_name}-${new Date().toISOString()}.pdf`,
         mimeType: 'application/pdf',
         parents: google_drive_parent_id ? [google_drive_parent_id] : undefined
       },
       media: { mimeType: 'application/pdf', body: new Blob([pdfBuffer]) }
     });

     await supabase
       .from('driver_daily_reports')
       .update({ drive_file_id: file.data.id, drive_file_url: `https://drive.google.com/file/d/${file.data.id}/view` })
       .eq('id', report_id);

     return new Response(JSON.stringify(file.data), { headers: { 'Content-Type': 'application/json' } });
   });
   ```
   > **Uwaga:** powyższy kod jest szkicem referencyjnym – w zależności od użytych bibliotek możesz potrzebować innej konwersji
   > strumienia PDF na `Uint8Array` w środowisku Deno.
2. Ustaw sekrety funkcji (Supabase → Edge Functions → Secrets):
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GOOGLE_CLIENT_EMAIL`
   - `GOOGLE_PRIVATE_KEY` (zastąp `\n` zwykłymi znakami nowej linii)
   - opcjonalnie `GOOGLE_DRIVE_PARENT_ID`
3. Wdróż funkcję: `supabase functions deploy generate-checklist-report`.

Funkcja może być rozszerzona o własny szablon PDF, język i logikę biznesową.

## Integracja z Google Workspace Drive

1. W Google Cloud utwórz projekt i API **Google Drive**.
2. Dodaj konto serwisowe i pobierz klucz JSON.
3. Udostępnij docelowy folder na Dysku temu kontu serwisowemu.
4. Skopiuj `id` folderu (ostatni segment adresu URL) i wpisz do `VITE_GOOGLE_DRIVE_PARENT_FOLDER_ID`.
5. Klucz JSON zapisany jako sekret Supabase wykorzystuje funkcja Edge (patrz wyżej).

## Instalacja zależności

```bash
npm install
```

> W środowiskach z ograniczonym dostępem do npm powtórz polecenie po przywróceniu sieci lub skonfiguruj prywatne mirror-y.

## Uruchomienie i build web

```bash
npm run dev    # tryb deweloperski
npm run build  # build produkcyjny
npm run lint   # kontrola jakości kodu
```

## Pakowanie aplikacji na Android (Capacitor)

1. Jednorazowo dodaj platformę:
   ```bash
   npx cap add android
   ```
2. Przy każdej aktualizacji frontendu synchronizuj zasoby:
   ```bash
   npm run android:sync
   ```
3. Otwórz projekt w Android Studio:
   ```bash
   npm run android:open
   ```
4. W Android Studio uzupełnij konfigurację aplikacji (ikony, nazwę, wersję) i utwórz APK/AAB (`Build > Generate Signed Bundle / APK`).
5. Aby aplikacja działała offline, włącz cache w service workerze (np. poprzez `vite-plugin-pwa`) – Capacitor przechowuje build w `android/app/src/main/assets/public`.
6. Dystrybuuj pakiet w Google Play lub w firmowym MDM. Dostęp do Supabase i Google Drive wykorzystuje te same zmienne środowiskowe co wersja web (w Androidzie umieść je w `.env.production` i przebuduj projekt).

## Struktura katalogów

```
src/
├─ components/      # współdzielone komponenty UI
├─ contexts/        # konfiguracja Supabase Auth
├─ hooks/           # logika odczytu i realtime
├─ lib/             # klient Supabase
├─ pages/           # widoki routingu, w tym DriverProfilePage
├─ styles/          # Tailwind i style globalne
└─ env.d.ts         # deklaracje zmiennych środowiskowych
```

## Dalsze kroki

- Rozszerz checklistę o zdjęcia (Supabase Storage) lub podpis elektroniczny kierowcy.
- Dodaj automatyczną wysyłkę raportu PDF e-mailem do backoffice (np. dodatkowa funkcja Edge).
- Zaimplementuj powiadomienia push (Firebase Cloud Messaging) dzięki Capacitor Push Notifications.
- Rozważ włączenie testów E2E (Playwright/Cypress) dla krytycznych scenariuszy.

Powodzenia w dalszym rozwijaniu platformy 3D Haulage! 🚛
