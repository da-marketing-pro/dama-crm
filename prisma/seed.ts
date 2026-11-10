import { PrismaClient, Role, Currency, StageType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Начинаем наполнение базы данных...");

  // 1. Очистка таблиц (для идемпотентности)
  await prisma.payment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.stage.deleteMany();
  await prisma.pipeline.deleteMany();
  await prisma.currencySetting.deleteMany();
  await prisma.dashboardWidget.deleteMany();
  await prisma.customFieldDefinition.deleteMany();
  await prisma.user.deleteMany();

  // 2. Создание пользователей
  const adminPasswordHash = await bcrypt.hash("admin123", 10);
  const managerPasswordHash = await bcrypt.hash("manager123", 10);

  const admin = await prisma.user.create({
    data: {
      name: "Администратор CRM",
      email: "admin@crm.local",
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  const manager = await prisma.user.create({
    data: {
      name: "Алихан Сейдалиев (Менеджер)",
      email: "manager@crm.local",
      passwordHash: managerPasswordHash,
      role: Role.MANAGER,
      isActive: true,
    },
  });

  console.log("✅ Пользователи созданы:", admin.email, manager.email);

  // 3. Курсы валют
  const currencySettings = await prisma.currencySetting.create({
    data: {
      baseCurrency: Currency.KZT,
      rateKzt: 1.0,
      rateUsd: 495.0,
      rateRub: 5.2,
    },
  });

  console.log("✅ Настройки валют созданы (Базовая: KZT, USD: 495, RUB: 5.2)");

  // 4. Воронка 1: «Холодный автообзвон»
  const coldCallPipeline = await prisma.pipeline.create({
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
    include: { stages: true },
  });

  // 5. Воронка 2: «Таргет Instagram»
  const targetInstagramPipeline = await prisma.pipeline.create({
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
    include: { stages: true },
  });

  console.log("✅ Созданы 2 воронки со всеми этапами");

  // 6. Базовые кастомные поля для контактов
  await prisma.customFieldDefinition.createMany({
    data: [
      {
        entityType: "CONTACT",
        name: "Должность",
        fieldType: "TEXT",
        isRequired: false,
      },
      {
        entityType: "CONTACT",
        name: "Город",
        fieldType: "TEXT",
        isRequired: false,
      },
      {
        entityType: "CONTACT",
        name: "Источник лида",
        fieldType: "SELECT",
        options: JSON.stringify(["Instagram", "Сайт", "Рекомендация", "Холодный звонок", "Выставка"]),
        isRequired: false,
      },
    ],
  });

  // 7. Тестовые контакты и сделки для наглядности работы CRM
  const contact1 = await prisma.contact.create({
    data: {
      name: "Ерлан Касымов",
      phone: "+77011234567",
      email: "yerlan@kasymov-corp.kz",
      company: "ТОО «Касымов Групп»",
      assignedToId: admin.id,
      customFields: {
        "Должность": "Генеральный директор",
        "Город": "Алматы",
        "Источник лида": "Холодный звонок",
      },
    },
  });

  const contact2 = await prisma.contact.create({
    data: {
      name: "Айгерим Нурланова",
      phone: "+77079876543",
      email: "aigerim@nur-beauty.kz",
      company: "Сеть салонов «Nur Beauty»",
      assignedToId: manager.id,
      customFields: {
        "Должность": "Владелец",
        "Город": "Астана",
        "Источник лида": "Instagram",
      },
    },
  });

  // Сделка 1
  const stagePrep1 = coldCallPipeline.stages.find((s) => s.order === 3)!;
  const deal1 = await prisma.deal.create({
    data: {
      title: "Внедрение CRM для Касымов Групп",
      contactId: contact1.id,
      pipelineId: coldCallPipeline.id,
      stageId: stagePrep1.id,
      assignedToId: admin.id,
      totalBudget: 1500000,
      currency: Currency.KZT,
      exchangeRateAtCreation: 1.0,
      payments: {
        create: [
          {
            contactId: contact1.id,
            amount: 500000,
            currency: Currency.KZT,
            amountInBaseCurrency: 500000,
            comment: "Аванс 30%",
          },
        ],
      },
      tasks: {
        create: [
          {
            title: "Подготовить и отправить финальное КП",
            dueDate: new Date(Date.now() + 86400000 * 2),
            assignedToId: admin.id,
            createdById: admin.id,
          },
        ],
      },
    },
  });

  // Сделка 2
  const stageTarget2 = targetInstagramPipeline.stages.find((s) => s.order === 4)!;
  const deal2 = await prisma.deal.create({
    data: {
      title: "Пакет автоматизации WhatsApp для Nur Beauty",
      contactId: contact2.id,
      pipelineId: targetInstagramPipeline.id,
      stageId: stageTarget2.id,
      assignedToId: manager.id,
      totalBudget: 1200,
      currency: Currency.USD,
      exchangeRateAtCreation: 495.0,
      payments: {
        create: [
          {
            contactId: contact2.id,
            amount: 600,
            currency: Currency.USD,
            amountInBaseCurrency: 600 * 495.0, // 297,000 KZT
            comment: "Предоплата 50% в долларах",
          },
        ],
      },
      tasks: {
        create: [
          {
            title: "Созвониться и сверить реквизиты для второго транша",
            dueDate: new Date(Date.now() + 86400000),
            assignedToId: manager.id,
            createdById: manager.id,
          },
        ],
      },
    },
  });

  console.log("✅ Тестовые данные (контакты, сделки, транши, задачи) добавлены!");
  console.log("🎉 Seed успешно завершен!");
}

main()
  .catch((e) => {
    console.error("❌ Ошибка выполнения seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
