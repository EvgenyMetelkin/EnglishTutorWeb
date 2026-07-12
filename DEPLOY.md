# Развёртывание на VPS

Инструкция по развёртыванию приложения «Репетитор английского» на VPS
с IP `185.252.146.230`. ОС — Debian 12 / Ubuntu 22.04+.

## Итоговая схема

```
Браузер пользователя
  │
  ├── http://185.252.146.230      → nginx (:80)  → статические файлы
  │
  └── http://185.252.146.230:11434 → Ollama (:11434) → Llama 3.2 3B
```

Браузер загружает страницу с nginx, затем напрямую обращается к Ollama на порту 11434.
Оба сервиса на одном VPS.

---

## 1. Подготовка VPS

Подключитесь по SSH:

```bash
ssh root@185.252.146.230
```

Базовые обновления и пакеты:

```bash
apt update && apt upgrade -y
apt install -y curl nginx
```

---

## 2. Настройка брандмауэра

Открываем порты 80 (веб) и 11434 (Ollama). Если используется `ufw`:

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 11434/tcp
ufw enable
```

Если `iptables` напрямую (проверьте, что не блокируется `ufw`):

```bash
iptables -A INPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 11434 -j ACCEPT
```

> **Важно:** порт 11434 будет открыт для всего интернета. Если Ollama используется
> кем-то ещё, ограничьте доступ: `ufw allow from <ваш_домашний_IP> to any port 11434`.
>
> Порт 22 (SSH) обязательно оставьте открытым, иначе вы потеряете доступ к серверу.

---

## 3. Установка и настройка Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### 3.1. Привязка ко всем интерфейсам

По умолчанию Ollama слушает только `127.0.0.1`. Чтобы браузер мог обратиться к
нему извне, нужен `0.0.0.0`.

Отредактируйте systemd сервис:

```bash
systemctl edit ollama.service
```

Вставьте:

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_ORIGINS=*"
```

Сохраните и перезапустите:

```bash
systemctl daemon-reload
systemctl restart ollama
systemctl enable ollama
```

### 3.2. Загрузка модели

```bash
ollama pull llama3.2:3b
```

Проверка:

```bash
ollama list
curl http://localhost:11434/api/tags
```

---

## 4. Размещение файлов приложения

Создайте директорию и скопируйте файлы:

```bash
mkdir -p /var/www/englishtutor
```

С локальной машины загрузите файлы (замените `<путь>` на путь к проекту):

```bash
# На локальной машине:
scp index.html styles.css app.js prompts.js config.js README.md \
    root@185.252.146.230:/var/www/englishtutor/
scp plans/*.js root@185.252.146.230:/var/www/englishtutor/plans/
```

Или целиком директорию:

```bash
scp -r . root@185.252.146.230:/var/www/englishtutor/
```

### 4.1. Настройка `config.js`

На VPS отредактируйте `config.js`:

```bash
nano /var/www/englishtutor/config.js
```

Замените:

```js
export const OLLAMA_BASE = "http://185.252.146.230:11434";
```

> Для локальной разработки оставьте `http://localhost:11434`.

### 4.2. Права

```bash
chown -R www-data:www-data /var/www/englishtutor
chmod -R 755 /var/www/englishtutor
```

---

## 5. Настройка nginx

Создайте конфигурацию сайта:

```bash
nano /etc/nginx/sites-available/englishtutor
```

```nginx
server {
    listen 80;
    server_name 185.252.146.230;

    root /var/www/englishtutor;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    # Кеширование статики
    location ~* \.(css|js|png|jpg|svg|ico)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
```

> Если домена нет, `server_name` можно заменить на `_` (любой хост) или оставить IP.

Активируйте:

```bash
ln -s /etc/nginx/sites-available/englishtutor /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default   # отключаем дефолтный сайт
nginx -t                                  # проверка конфигурации
systemctl reload nginx
```

---

## 6. Проверка

1. Откройте в браузере: `http://185.252.146.230`
   — должна загрузиться страница приложения.
2. В боковой панели нажмите `⟳` (обновить список моделей) —
   должен появиться `llama3.2:3b`.
3. Отправьте тестовое сообщение, например `I has a apple` — репетитор должен
   ответить.

Если модели нет в списке:
- Проверьте, что Ollama запущен: `systemctl status ollama`
- Проверьте, что порт открыт: `curl http://localhost:11434/api/tags`
- Проверьте CORS в консоли браузера (F12 → Network). Если есть ошибки —
  убедитесь, что задана `OLLAMA_ORIGINS=*`.

---

## 7. Автозапуск после перезагрузки

Оба сервиса должны стартовать автоматически:

```bash
systemctl enable nginx
systemctl enable ollama
```

---

## 8. Обновление приложения

С локальной машины:

```bash
scp index.html styles.css app.js prompts.js config.js \
    root@185.252.146.230:/var/www/englishtutor/
scp plans/*.js root@185.252.146.230:/var/www/englishtutor/plans/
```

Никаких перезапусков не требуется — nginx раздаёт статику, изменения
применяются сразу после копирования.
