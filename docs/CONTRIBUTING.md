# 🤝 Kontrybucja

Wkład w rozwój projektu przyjmowany jest w formie pull requestów oraz zgłoszeń w Issues.

Zalecany przebieg prac:

- opis problemu lub propozycji zmiany (Issue),
- implementacja w osobnej gałęzi,
- dołączenie testów dla zmian zachowania,
- utrzymanie jakości: uruchomienie testów oraz podstawowych kontroli jakości,
- krótki opis zmian i uzasadnienie w PR.

## Release / tagowanie

W tym repo zalecany sposób publikacji zmian to:

- commitujesz zmiany,
- uruchamiasz `make push` (automatycznie bump wersji, generacja `docs/v/<tag>/...`, commit release, tag i push).

Zobacz `docs/TESTING.md` oraz `README.md`.
