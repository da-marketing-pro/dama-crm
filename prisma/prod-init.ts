import { PrismaClient, Role, Currency, StageType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function initProd() {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log(
      `ℹ️ [DAMA CRM] В базе уже зарегистрировано пользователей: ${userCount}. Начальная инициализация не требуется.`
    );
    return;
  }

  console.log(
    "🌱 [DAMA CRM] База данных пуста. Создаем начального администратора и базовые настройки..."
  );

  const adminEmail = (process.env.ADMIN_INITIAL_EMAIL || "admin@crm.local")
    .toLowerCase()
    .trim();
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || "admin123";
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.$transaction(async (tx) => {
    const createdAdmin = await tx.user.create({
      data: {
        name: "Администратор CRM",
        email: adminEmail,
        passwordHash: adminPasswordHash,
        role: Role.ADMIN,
        isActive: true,
      },
    });

    // Настройки валют по умолчанию
    await tx.currencySetting.create({
      data: {
        baseCurrency: Currency.USD,
        rateKzt: 1.0,
        rateUsd: 495.0,
        rateRub: 5.2,
      },
    });

    // Базовая воронка 1: «Холодный автообзвон»
    await tx.pipeline.create({
      data: {
        name: "Холодный автообзвон",
        order: 1,
        isDefault: true,
        stages: {
          create: [
            { name: "Неразобранное", color: "#94A3B8", order: 1, type: StageType.OPEN },
            { name: "Квалификация", color: "#38BDF8", order: 2, type: StageType.OPEN },
            { name: "Презентация / КП", color: "#818CF8", order: 3, type: StageType.OPEN },
            { name: "Согласование договора", color: "#F59E0B", order: 4, type: StageType.OPEN },
            { name: "Успешно реализовано", color: "#10B981", order: 5, type: StageType.WON },
            { name: "Закрыто и не реализовано", color: "#EF4444", order: 6, type: StageType.LOST },
          ],
        },
      },
    });

    // Базовая воронка 2: «Таргет Instagram»
    await tx.pipeline.create({
      data: {
        name: "Таргет Instagram",
        order: 2,
        isDefault: false,
        stages: {
          create: [
            { name: "Новая заявка", color: "#94A3B8", order: 1, type: StageType.OPEN },
            { name: "Первичный контакт", color: "#38BDF8", order: 2, type: StageType.OPEN },
            { name: "Отправлен прайс", color: "#818CF8", order: 3, type: StageType.OPEN },
            { name: "Ожидание оплаты", color: "#F59E0B", order: 4, type: StageType.OPEN },
            { name: "Успешно реализовано", color: "#10B981", order: 5, type: StageType.WON },
            { name: "Закрыто и не реализовано", color: "#EF4444", order: 6, type: StageType.LOST },
          ],
        },
      },
    });

    return createdAdmin;
  });

  console.log(
    `✅ [DAMA CRM] Первичная настройка завершена. Создан Администратор: ${admin.email}`
  );
}

initProd()
  .catch((err) => {
    console.error("❌ [DAMA CRM] Критическая ошибка при инициализации:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
