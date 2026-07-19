# Развёртывание на VPS

Инструкция по развёртыванию English Tutor на VPS с IP `185.252.146.230`.
ОС: Debian 12 / Ubuntu 22.04+.

## Архитектура

```
Браузер пользователя
  │
  └─ http://185.252.146.230 (порт 80)
       │
       nginx (порт 80)
       │  проксирует на localhost:3000
       │
       Node.js Express (порт 3000)
       ├── /api/login     → проверка пароля, выдача JWT
       ├── /api/chat      → прокси в DeepSeek / OpenAI / Anthropic
       ├── статические файлы (index.html, *.js, *.css, plans/)
       │
       └── [опционально] Ollama (порт 11434)
            браузер обращается напрямую к Ollama на VPS
```

---

## 1. Подготовка VPS

Подключитесь по SSH:

```bash
ssh root@185.252.146.230
```

### 1.1. Установка Node.js 18+

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version   # должно быть v18+
```

### 1.2. Установка остальных пакетов

```bash
apt update && apt upgrade -y
apt install -y nginx git
```

### 1.3. Установка PM2 (менеджер процессов)

```bash
npm install -g pm2
pm2 startup systemd   # автозапуск после перезагрузки
```

---

## 2. Брандмауэр

Открываем порты 22 (SSH), 80 (веб), 11434 (Ollama — опционально, только если используете локальные модели на VPS).

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw enable
```

Если нужен Ollama на VPS:

```bash
ufw allow 11434/tcp
```

> **Важно:** порт 22 (SSH) обязательно оставьте открытым.

---

## 3. Клонирование и настройка проекта

### 3.1. Клонируйте репозиторий

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/EvgenyMetelkin/Web.git englishtutor
cd englishtutor
git checkout feat/cloud-models-auth-speech
```

### 3.2. Установите зависимости

```bash
npm install --production
```

### 3.3. Создайте `.env`

```bash
nano .env
```

Содержимое:

```bash
APP_PASSWORD_HASH=<bcrypt-хеш пароля>
JWT_SECRET=<длинная случайная строка>
DEEPSEEK_KEY=sk-...       # если используете DeepSeek
OPENAI_KEY=sk-...         # если используете OpenAI
ANTHROPIC_KEY=sk-ant-...  # если используете Anthropic
PORT=3000
```

Для генерации хеша пароля **на локальной машине** (Node.js должен быть установлен):

```bash
cd путь/к/проекту
npm run hash "ваш-пароль"
```

Скопируйте вывод. На сервере вставьте в `APP_PASSWORD_HASH`.

Если Node.js нет локально, сгенерируйте на сервере (временно установите dev-зависимости или используйте онлайн-инструмент bcrypt).

### 3.4. Проверьте, что сервер запускается

```bash
node server.js
```

Должен вывести: `English Tutor server: http://localhost:3000`

Нажмите `Ctrl+C` для остановки. Если всё работает — идём дальше.

---

## 4. PM2 — автозапуск и управление

### 4.1. Создайте конфигурацию PM2

```bash
nano /var/www/englishtutor/ecosystem.config.cjs
```

```js
module.exports = {
  apps: [{
    name: "englishtutor",
    script: "server.js",
    cwd: "/var/www/englishtutor",
    env: {
      NODE_ENV: "production"
    },
    max_memory_restart: "300M",
    log_date_format: "YYYY-MM-DD HH:mm:ss"
  }]
};
```

### 4.2. Запустите приложение

```bash
cd /var/www/englishtutor
pm2 start ecosystem.config.cjs
pm2 save
```

Команды управления:

```bash
pm2 status              # статус
pm2 logs englishtutor   # логи
pm2 restart englishtutor # перезапуск
pm2 stop englishtutor   # остановка
```

---

## 5. Nginx — обратный прокси

### 5.1. Создайте конфигурацию

```bash
nano /etc/nginx/sites-available/englishtutor
```

```nginx
server {
    listen 80;
    server_name 185.252.146.230;

    # Максимальный размер тела запроса (для chat-запросов)
    client_max_body_size 1M;

    # Проксируем все запросы на Express
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # Таймауты для SSE-стриминга
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_buffering off;

        # Кеширование статики
        location ~* \.(css|js|png|jpg|svg|ico)$ {
            proxy_pass http://127.0.0.1:3000;
            expires 7d;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

> **Важно:** `proxy_buffering off` и `proxy_read_timeout 300s` — обязательны для потоковых ответов (SSE). Без них чат не будет работать.

### 5.2. Активируйте конфигурацию

```bash
ln -s /etc/nginx/sites-available/englishtutor /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

### 5.3. Автозапуск nginx

```bash
systemctl enable nginx
```

---

## 6. Проверка

1. Откройте в браузере: **http://185.252.146.230**
2. Должен появиться экран входа
3. Введите пароль → главный экран приложения
4. Выберите провайдера (DeepSeek / OpenAI / Anthropic) и модель
5. Отправьте тестовое сообщение — репетитор должен ответить потоково

---

## 7. (Опционально) Установка Ollama на VPS

Если хотите использовать локальные модели без облачных API:

### 7.1. Установка

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### 7.2. Настройка доступа извне

```bash
systemctl edit ollama.service
```

Вставьте:

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_ORIGINS=*"
```

```bash
systemctl daemon-reload
systemctl restart ollama
systemctl enable ollama
```

### 7.3. Загрузка модели

```bash
ollama pull llama3.2:3b
```

Проверка:

```bash
ollama list
curl http://localhost:11434/api/tags
```

### 7.4. Настройка config.js

Отредактируйте `config.js` на сервере:

```bash
nano /var/www/englishtutor/config.js
```

Замените `OLLAMA_BASE`:

```js
export const OLLAMA_BASE = "http://185.252.146.230:11434";
```

### 7.5. Откройте порт 11434

```bash
ufw allow 11434/tcp
```

### 7.6. Перезапустите приложение

```bash
pm2 restart englishtutor
```

---

## 8. (Опционально) HTTPS через Let's Encrypt

Для работы голосового ввода в продакшене **требуется HTTPS** (Web Speech API не работает через HTTP на удалённом сервере).

Для этого нужен домен, направленный на IP сервера. Если домена нет — голосовой ввод будет недоступен, остальной функционал работает.

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d ваш-домен.com
```

Certbot автоматически обновит конфигурацию nginx и настроит автообновление сертификата.

После настройки HTTPS измените `server.js`: Express будет слушать localhost, а nginx — обрабатывать SSL.

---

## 9. Обновление приложения

С локальной машины:

```bash
# Отправьте файлы на сервер
scp server.js providers.js auth.js speech.js app.js config.js prompts.js \
    root@185.252.146.230:/var/www/englishtutor/
scp index.html styles.css root@185.252.146.230:/var/www/englishtutor/
scp plans/*.js root@185.252.146.230:/var/www/englishtutor/plans/

# Или целиком директорию (осторожно — не перезапишите .env):
rsync -av --exclude node_modules --exclude .env --exclude .git \
    ./ root@185.252.146.230:/var/www/englishtutor/
```

Затем на сервере:

```bash
ssh root@185.252.146.230
cd /var/www/englishtutor
npm install --production   # если изменились зависимости
pm2 restart englishtutor
```

---

## 10. Мониторинг

```bash
# Статус приложения
pm2 status

# Логи в реальном времени
pm2 logs englishtutor

# Использование памяти
pm2 monit

# Логи nginx
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

## 11. Устранение неполадок

| Симптом | Проверка |
|---------|----------|
| Сайт не открывается | `systemctl status nginx`, `pm2 status` |
| Ошибка 502 Bad Gateway | Express не запущен: `pm2 logs englishtutor` |
| Бесконечная загрузка при отправке | Проверьте `proxy_buffering off` в nginx |
| Ошибка аутентификации | Проверьте `APP_PASSWORD_HASH` в `.env` |
| «Cloud API error» | Проверьте API-ключ и баланс: `cat .env \| grep KEY` |
| Ollama не в списке моделей | `systemctl status ollama`, порт 11434 открыт? |
| Голосовой ввод не работает | Нужен HTTPS (см. раздел 8) или открывайте через localhost |
