import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { BasicBondInfo, BondDetails } from "../shared/api/moex";
import {
  getBasicBondInfo,
  getBondDetails,
  getHistoricalBondSnapshot,
} from "../shared/api/moex";
import {
  loadCalculatorPreferences,
  saveCalculatorPreferences,
} from "../shared/persistence";
import { CalculatorPage } from "./CalculatorPage";

vi.mock("../shared/api/moex", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/api/moex")>();

  return {
    ...actual,
    getBasicBondInfo: vi.fn(),
    getBondDetails: vi.fn(),
    getHistoricalBondSnapshot: vi.fn(),
  };
});

const getBasicBondInfoMock = vi.mocked(getBasicBondInfo);
const getBondDetailsMock = vi.mocked(getBondDetails);
const getHistoricalBondSnapshotMock = vi.mocked(getHistoricalBondSnapshot);

describe("CalculatorPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    getBasicBondInfoMock.mockReset();
    getBondDetailsMock.mockReset();
    getHistoricalBondSnapshotMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("restores global commission and tax settings after loading a bond", async () => {
    saveCalculatorPreferences({
      commissionPercent: "0.12",
      taxPercent: "15",
    });
    getBasicBondInfoMock.mockResolvedValue(createBond());
    getBondDetailsMock.mockResolvedValue(createDetails());

    renderCalculatorPage();

    await screen.findByRole("heading", { name: "Тест 001" });
    expect(screen.getByLabelText("комиссия, %")).toHaveValue("0.12");
    expect(screen.getByLabelText("налог, %")).toHaveValue("15");
  });

  it("persists commission and tax changes", async () => {
    getBasicBondInfoMock.mockResolvedValue(createBond());
    getBondDetailsMock.mockResolvedValue(createDetails());

    renderCalculatorPage();

    await screen.findByRole("heading", { name: "Тест 001" });
    fireEvent.change(screen.getByLabelText("комиссия, %"), {
      target: { value: "0.08" },
    });
    fireEvent.change(screen.getByLabelText("налог, %"), {
      target: { value: "18" },
    });

    expect(loadCalculatorPreferences()).toEqual({
      commissionPercent: "0.08",
      taxPercent: "18",
    });
  });

  it("temporarily excludes tax and commission without overwriting their values", async () => {
    const user = userEvent.setup();
    getBasicBondInfoMock.mockResolvedValue(createBond());
    getBondDetailsMock.mockResolvedValue(createDetails());

    renderCalculatorPage();

    await screen.findByRole("heading", { name: "Тест 001" });
    const resultsCard = screen
      .getByRole("heading", { name: "Результаты" })
      .closest('[data-slot="card"]')!;
    const detailsCard = screen
      .getByRole("heading", { name: "Детализация" })
      .closest('[data-slot="card"]')!;
    const initialProfit = getDefinitionValue(resultsCard, "прибыль");
    const initialCommission = getDefinitionValue(detailsCard, "комиссия");
    const taxToggle = screen.getByRole("button", { name: "Налог" });
    const commissionToggle = screen.getByRole("button", { name: "Комиссия" });
    const toggleGroup = screen.getByRole("toolbar", {
      name: "Учет налога и комиссии",
    });

    expect(taxToggle).toHaveAttribute("aria-pressed", "false");
    expect(commissionToggle).toHaveAttribute("aria-pressed", "false");
    expect(taxToggle).toHaveClass("h-9");
    expect(commissionToggle).toHaveClass("h-9");
    expect(taxToggle).toHaveClass("border", "bg-transparent");
    expect(commissionToggle).toHaveClass("border", "bg-transparent");
    expect(
      Array.from(toggleGroup.querySelectorAll("button"), (button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(["с комиссией", "с налогом"]);

    await user.click(taxToggle);

    expect(taxToggle).toHaveAttribute("aria-pressed", "true");
    expect(taxToggle).toHaveTextContent("без налога");
    expect(getDefinitionValue(detailsCard, "налог")).toBe("0,00 ₽");
    expect(getDefinitionValue(resultsCard, "прибыль")).not.toBe(initialProfit);

    await user.click(commissionToggle);

    expect(commissionToggle).toHaveAttribute("aria-pressed", "true");
    expect(commissionToggle).toHaveTextContent("без комиссии");
    expect(getDefinitionValue(detailsCard, "комиссия")).toBe("0,00 ₽");
    expect(getDefinitionValue(detailsCard, "комиссия")).not.toBe(
      initialCommission,
    );
    expect(screen.getByLabelText("комиссия, %")).toHaveValue("0.05");
    expect(screen.getByLabelText("налог, %")).toHaveValue("13");
    expect(loadCalculatorPreferences()).toEqual({
      commissionPercent: "0.05",
      taxPercent: "13",
    });
  });

  it("loads selected bond data and uses the offer mode when an offer exists", async () => {
    const user = userEvent.setup();
    getBasicBondInfoMock.mockResolvedValue(createBond());
    getBondDetailsMock.mockResolvedValue(createDetails());

    renderCalculatorPage();

    expect(screen.getByText("Загружаем облигацию")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Тест 001" })).toBeInTheDocument();
    expect(getBasicBondInfoMock).toHaveBeenCalledWith({ secid: "RU000A_TEST" });
    expect(getBondDetailsMock).toHaveBeenCalledWith("RU000A_TEST");
    expect(screen.queryByText("SECID")).not.toBeInTheDocument();
    expect(screen.queryByText("RU000A_TEST")).not.toBeInTheDocument();
    expect(screen.queryByText("Board")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Поиск облигаций" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Назад к поиску" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.queryByRole("menuitem", { name: "Доходъ" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Внешние ссылки" }));
    expect(
      screen.getByRole("menuitem", { name: "Доходъ" }),
    ).toHaveAttribute("href", "https://analytics.dohod.ru/bond/RU000A000000");
    expect(
      screen.getByRole("menuitem", { name: "Доходъ" }),
    ).toHaveAttribute("target", "_blank");
    expect(
      screen.getByRole("menuitem", { name: "Доходъ" }),
    ).toHaveAttribute("rel", "noreferrer");
    await user.click(screen.getByRole("heading", { name: "Тест 001" }));
    expect(
      screen.queryByRole("menuitem", { name: "Доходъ" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Оферта" })).toHaveAttribute(
      "data-state",
      "on",
    );
    expect(screen.getByLabelText("цена продажи, %")).toHaveValue("99.5");
    expect(screen.getByText("158,52 ₽")).toBeInTheDocument();
    expect(screen.getByText("тек. доходность")).toBeInTheDocument();
    expect(screen.getByText("9,67 %")).toBeInTheDocument();
    expect(
      Array.from(
        screen
          .getByRole("heading", { name: "Тест 001" })
          .closest('[data-slot="card"]')!
          .querySelectorAll("dt"),
        (element) => element.firstChild?.textContent,
      ),
    ).toEqual(["погашение", "дата купона", "купон", "оферта"]);
    expect(screen.getByText("* по данным MOEX")).toHaveClass(
      "text-right",
      "text-xs",
      "text-muted-foreground",
    );
    expect(
      screen.getByRole("button", { name: "Формула текущей доходности" }),
    ).toHaveAccessibleDescription(
      "Текущая доходность по формуле:\nКупон / цена покупки − налог",
    );
    expect(
      screen.getByRole("button", {
        name: "Описание показателя «доходность XIRR»",
      }),
    ).toHaveAccessibleDescription(
      "Годовая доходность с учетом дат купонов, амортизаций и погашения.",
    );
    expect(
      screen.queryByRole("button", {
        name: "Описание показателя «совокупная прибыль»",
      }),
    ).not.toBeInTheDocument();
    expect(
      Array.from(
        screen
          .getByRole("heading", { name: "Результаты" })
          .closest('[data-slot="card"]')!
          .querySelectorAll("dt"),
        (element) => element.firstChild?.textContent,
      ),
    ).toEqual([
      "тек. доходность",
      "доходность XIRR",
      "прибыль",
      "срок, дней",
    ]);
    expect(screen.getByText("НКД покупки")).toBeInTheDocument();
    expect(screen.getByText("получено купонов")).toBeInTheDocument();
  });

  it("copies the ISIN from the issue header", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    getBasicBondInfoMock.mockResolvedValue(createBond());
    getBondDetailsMock.mockResolvedValue(createDetails());

    renderCalculatorPage();

    await screen.findByRole("heading", { name: "Тест 001" });
    await user.click(
      screen.getByRole("button", { name: "Скопировать ISIN RU000A000000" }),
    );

    expect(writeText).toHaveBeenCalledWith("RU000A000000");
    expect(
      screen.getByRole("button", { name: "ISIN RU000A000000 скопирован" }),
    ).toBeInTheDocument();
  });

  it("disables offer mode and falls back to maturity when there is no offer", async () => {
    getBasicBondInfoMock.mockResolvedValue(createBond({ offer_date: null }));
    getBondDetailsMock.mockResolvedValue(
      createDetails({ nextOfferDate: null, offerSchedule: [] }),
    );

    renderCalculatorPage();

    expect(await screen.findByRole("heading", { name: "Тест 001" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Погашение" })).toHaveAttribute(
        "data-state",
        "on",
      );
    });
    expect(screen.getByRole("radio", { name: "Оферта" })).toBeDisabled();
    expect(screen.getByLabelText("дата продажи")).toHaveValue("2030-06-15");
    expect(
      Array.from(
        screen
          .getByRole("heading", { name: "Результаты" })
          .closest('[data-slot="card"]')!
          .querySelectorAll("dt"),
        (element) => element.firstChild?.textContent,
      ),
    ).toEqual([
      "тек. доходность",
      "доходность XIRR",
      "прибыль",
      "срок, дней",
    ]);
  });

  it("switches to sale mode and recalculates after field changes", async () => {
    const user = userEvent.setup();
    getBasicBondInfoMock.mockResolvedValue(createBond());
    getBondDetailsMock.mockResolvedValue(createDetails());

    renderCalculatorPage();

    await screen.findByRole("heading", { name: "Тест 001" });
    await user.click(screen.getByRole("radio", { name: "Продажа" }));
    await user.clear(screen.getByLabelText("цена продажи, %"));
    await user.type(screen.getByLabelText("цена продажи, %"), "110");

    expect(screen.getByLabelText("дата продажи")).toHaveValue("2026-06-16");
    expect(screen.getByLabelText("цена продажи, %")).toHaveValue("110");
    expect(screen.getByText("173,37 ₽")).toBeInTheDocument();
    expect(screen.getByText("6 932,56 %")).toHaveClass("font-semibold");
    expect(
      screen.queryByRole("button", {
        name: "Описание показателя «доходность XIRR»",
      }),
    ).not.toBeInTheDocument();
    expect(
      Array.from(
        screen
          .getByRole("heading", { name: "Результаты" })
          .closest('[data-slot="card"]')!
          .querySelectorAll("dt"),
        (element) => element.firstChild?.textContent,
      ),
    ).toEqual([
      "тек. доходность",
      "доходность, год",
      "прибыль",
      "срок, дней",
    ]);
    expect(screen.getByText("НКД продажи")).toBeInTheDocument();
    expect(screen.queryByText("купоны, оценка")).not.toBeInTheDocument();
  });

  it("uses today as the sale date when the buy date is in the past", async () => {
    const user = userEvent.setup();
    getBasicBondInfoMock.mockResolvedValue(createBond());
    getBondDetailsMock.mockResolvedValue(createDetails());
    getHistoricalBondSnapshotMock.mockResolvedValue({
      tradeDate: "2026-06-10",
      accruedInterest: 7.5,
      couponAmount: 50,
      couponAnnualPercent: 10,
      faceValue: 1000,
    });

    renderCalculatorPage();

    await screen.findByRole("heading", { name: "Тест 001" });
    fireEvent.change(screen.getByLabelText("дата сделки"), {
      target: { value: "2026-06-10" },
    });
    await user.click(screen.getByRole("radio", { name: "Продажа" }));

    expect(screen.getByLabelText("дата продажи")).toHaveValue("2026-06-15");
  });

  it("shows an error state when bond data cannot be loaded", async () => {
    getBasicBondInfoMock.mockRejectedValue(new Error("MOEX request failed"));
    getBondDetailsMock.mockResolvedValue(createDetails());

    renderCalculatorPage();

    expect(await screen.findByText("Не удалось открыть калькулятор")).toBeInTheDocument();
    expect(screen.getByText("MOEX request failed")).toBeInTheDocument();
  });

  it("does not show the dohod.ru link when an ISIN is unavailable", async () => {
    getBasicBondInfoMock.mockResolvedValue(createBond({ isin: "" }));
    getBondDetailsMock.mockResolvedValue(createDetails({ isin: null }));

    renderCalculatorPage();

    await screen.findByRole("heading", { name: "Тест 001" });

    expect(screen.queryByRole("button", { name: "Внешние ссылки" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Доходъ" })).not.toBeInTheDocument();
  });

  it("loads accrued interest for a historical buy date", async () => {
    getBasicBondInfoMock.mockResolvedValue(createBond());
    getBondDetailsMock.mockResolvedValue(createDetails());
    getHistoricalBondSnapshotMock.mockResolvedValue({
      tradeDate: "2026-06-10",
      accruedInterest: 7.5,
      couponAmount: 50,
      couponAnnualPercent: 10,
      faceValue: 900,
    });

    renderCalculatorPage();

    await screen.findByRole("heading", { name: "Тест 001" });
    fireEvent.change(screen.getByLabelText("дата сделки"), {
      target: { value: "2026-06-10" },
    });

    expect(await screen.findByText("7,50 ₽")).toBeInTheDocument();
    expect(screen.getByLabelText("номинал")).toHaveValue("900");
    expect(getHistoricalBondSnapshotMock).toHaveBeenCalledWith({
      secid: "RU000A_TEST",
      boardId: "TQOB",
      date: "2026-06-10",
    });
  });

  it("keeps edited inputs and the selected mode after a background MOEX update", async () => {
    const user = userEvent.setup();
    getBasicBondInfoMock.mockResolvedValue(createBond());
    getBondDetailsMock.mockResolvedValue(createDetails());

    const { queryClient } = renderCalculatorPage();

    await screen.findByRole("heading", { name: "Тест 001" });
    await user.click(screen.getByRole("radio", { name: "Продажа" }));
    fireEvent.change(screen.getByLabelText("цена, %"), {
      target: { value: "95" },
    });
    getBasicBondInfoMock.mockResolvedValue(createBond({ last_price: 80 }));

    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: ["bond-calculator", "RU000A_TEST"],
      });
    });

    expect(screen.getByLabelText("цена, %")).toHaveValue("95");
    expect(screen.getByRole("radio", { name: "Продажа" })).toHaveAttribute(
      "data-state",
      "on",
    );
    expect(
      await screen.findByRole("button", { name: "Обновить значения из MOEX" }),
    ).toBeInTheDocument();
  });

  it("refreshes MOEX values explicitly while preserving the selected mode", async () => {
    const user = userEvent.setup();
    getBasicBondInfoMock.mockResolvedValue(createBond());
    getBondDetailsMock.mockResolvedValue(createDetails());

    const { queryClient } = renderCalculatorPage();

    await screen.findByRole("heading", { name: "Тест 001" });
    await user.click(screen.getByRole("radio", { name: "Продажа" }));
    fireEvent.change(screen.getByLabelText("цена, %"), {
      target: { value: "95" },
    });
    getBasicBondInfoMock.mockResolvedValue(createBond({ last_price: 80 }));

    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: ["bond-calculator", "RU000A_TEST"],
      });
    });
    await user.click(
      await screen.findByRole("button", { name: "Обновить значения из MOEX" }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("цена, %")).toHaveValue("80");
    });
    expect(screen.getByRole("radio", { name: "Продажа" })).toHaveAttribute(
      "data-state",
      "on",
    );
    expect(
      screen.queryByRole("button", { name: "Обновить значения из MOEX" }),
    ).not.toBeInTheDocument();
  });

  it("switches to maturity and briefly explains when an offer disappears", async () => {
    getBasicBondInfoMock.mockResolvedValue(createBond());
    getBondDetailsMock.mockResolvedValue(createDetails());

    const { queryClient } = renderCalculatorPage();

    await screen.findByRole("heading", { name: "Тест 001" });
    getBasicBondInfoMock.mockResolvedValue(createBond({ offer_date: null }));
    getBondDetailsMock.mockResolvedValue(
      createDetails({ nextOfferDate: null, offerSchedule: [] }),
    );

    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: ["bond-calculator", "RU000A_TEST"],
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Погашение" })).toHaveAttribute(
        "data-state",
        "on",
      );
    });
    expect(screen.getByText("Оферта больше не доступна")).toBeInTheDocument();
  });

  it("marks unknown future coupons as a forecast", async () => {
    getBasicBondInfoMock.mockResolvedValue(
      createBond({ coupon_percent: 20 }),
    );
    getBondDetailsMock.mockResolvedValue(
      createDetails({
        couponSchedule: [
          {
            date: "2026-06-15",
            startDate: "2025-12-15",
            amount: 40,
            annualPercent: 8,
          },
          {
            date: "2026-12-15",
            startDate: "2026-06-16",
            amount: null,
            annualPercent: null,
          },
        ],
      }),
    );

    renderCalculatorPage();

    const warning = await screen.findByText(
      "Будущие купоны спрогнозированы по ставке последнего известного купона 8% годовых. Фактическая доходность может отличаться.",
    );

    expect(warning).toBeInTheDocument();
    expect(warning).toHaveClass("text-muted-foreground");
  });

  it("counts unknown amortization amounts as zero and warns about it", async () => {
    getBasicBondInfoMock.mockResolvedValue(createBond());
    getBondDetailsMock.mockResolvedValue(
      createDetails({
        amortizationSchedule: [
          { date: "2026-12-15", amount: null, percent: null },
        ],
      }),
    );

    renderCalculatorPage();

    await screen.findByRole("heading", { name: "Тест 001" });

    expect(
      screen.getByText(
        "Не удалось определить сумму амортизаций: 1. Такие амортизации учтены как 0.",
      ),
    ).toBeInTheDocument();
  });
});

function renderCalculatorPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/bond/RU000A_TEST"]}>
        <Routes>
          <Route path="/bond/:secid" element={<CalculatorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { ...renderResult, queryClient };
}

function getDefinitionValue(container: Element, label: string): string {
  const term = Array.from(container.querySelectorAll("dt")).find(
    (element) => element.firstChild?.textContent === label,
  );

  return term?.nextElementSibling?.textContent ?? "";
}

function createBond(overrides: Partial<BasicBondInfo> = {}): BasicBondInfo {
  return {
    shortname: "Тест 001",
    secid: "RU000A_TEST",
    isin: "RU000A000000",
    mat_date: "2030-06-15",
    coupon_percent: 10,
    list_level: 1,
    coupon_value: 50,
    coupon_date: "2026-12-15",
    nkd: 12.34,
    currency_id: "SUR",
    face_unit: "SUR",
    face_value: 1000,
    coupon_period: 182,
    issue_size: 1000000,
    offer_date: "2027-06-15",
    prev_price: 90,
    last_price: null,
    reg_number: "TEST",
    ...overrides,
  };
}

function createDetails(overrides: Partial<BondDetails> = {}): BondDetails {
  return {
    secid: "RU000A_TEST",
    isin: "RU000A000000",
    shortName: "Тест 001",
    name: "Тестовая облигация",
    boardId: "TQOB",
    maturityDate: "2030-06-15",
    nextOfferDate: "2027-06-15",
    offerSchedule: [
      {
        date: "2027-06-15",
        pricePercent: 99.5,
        value: null,
        type: "put",
      },
    ],
    couponSchedule: [
      {
        date: "2026-12-15",
        startDate: "2026-06-16",
        amount: 50,
        annualPercent: 10,
      },
      {
        date: "2027-06-15",
        startDate: "2026-12-15",
        amount: 50,
        annualPercent: 10,
      },
    ],
    amortizationSchedule: [],
    ...overrides,
  };
}
