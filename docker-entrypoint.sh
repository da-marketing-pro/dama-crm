#!/bin/sh
set -e

echo "=========================================================="
echo " 🚀 DAMA CRM: Инициализация запуска контейнера..."
echo "=========================================================="

# 1. Проверка и ожидание подключения к PostgreSQL
echo "⏳ [DAMA CRM] Ожидание подключения к PostgreSQL..."
MAX_RETRIES=30
RETRY_COUNT=0

until prisma db push --skip-generate || [ $RETRY_COUNT -ge $MAX_RETRIES ]; do
  echo "⚠️ База данных еще не готова. Повтор через 2 секунды ($((RETRY_COUNT+1))/$MAX_RETRIES)..."
  RETRY_COUNT=$((RETRY_COUNT+1))
  sleep 2
done

if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
  echo "❌ [DAMA CRM] Ошибка: Не удалось подключиться к базе данных за отведенное время."
  exit 1
fi

echo "✅ [DAMA CRM] Структура базы данных успешно синхронизирована (Prisma db push)."

# 2. Первичная инициализация (только если база пустая)
echo "🌱 [DAMA CRM] Проверка и создание начальных данных..."
tsx prisma/prod-init.ts

echo "🌟 [DAMA CRM] Запуск веб-сервера Next.js..."
exec "$@"
