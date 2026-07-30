
  # Mint Green Photography Dashboard

  This is a code bundle for Mint Green Photography Dashboard. The original project is available at https://www.figma.com/design/buXRTLYi0nCy58AiNmjUuR/Mint-Green-Photography-Dashboard.

  ## Running the code

  **Frontend** (`client/`): run `npm i`, then `npm run dev`.

  **Backend** (`server/`): create a virtualenv, `pip install -r requirements.txt`, copy `server/.env.example` to `server/.env`, then `python manage.py migrate` and `python manage.py runserver`.

  **Local Postgres + Redis**: from the repo root, `docker compose up -d`, then set `DATABASE_URL` and `REDIS_URL` in `server/.env` as in `.env.example`. See [server/docs/LOCAL_DATABASE.md](server/docs/LOCAL_DATABASE.md).

  **Frontend env**: copy `client/.env.example` to `client/.env` if you need to override API URLs.
  