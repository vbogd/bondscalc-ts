import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
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
    expect(screen.getByText("17,37 %")).toBeInTheDocument();
    expect(screen.getByText("тек. доходность")).toBeInTheDocument();
    expect(screen.getByText("9,67 %")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Формула текущей доходности" }),
    ).toHaveAccessibleDescription(
      "Расчет текущей доходности по формуле:\nКупон / цена покупки − налог",
    );
    expect(
      screen.getByRole("button", {
        name: "Описание показателя «доходность XIRR, годовая»",
      }),
    ).toHaveAccessibleDescription(
      "Годовая доходность после налога с учетом дат купонов, амортизаций и погашения.",
    );
    expect(
      screen.getByRole("button", {
        name: "Описание показателя «совокупная прибыль, годовая»",
      }),
    ).toHaveAccessibleDescription(
      "Прибыль после налога относительно затрат, линейно пересчитанная на год.",
    );
    expect(
      Array.from(
        screen
          .getByRole("heading", { name: "Результаты" })
          .closest('[data-slot="card"]')!
          .querySelectorAll("dt"),
        (element) => element.firstChild?.textContent,
      ),
    ).toEqual([
      "доходность XIRR, годовая",
      "совокупная прибыль, годовая",
      "прибыль после налога",
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
    expect(screen.getByRole("radio", { name: "Погашение" })).toHaveAttribute(
      "data-state",
      "on",
    );
    expect(screen.getByRole("radio", { name: "Оферта" })).toBeDisabled();
    expect(screen.getByLabelText("дата продажи")).toHaveValue("2030-06-15");
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
    expect(screen.getByText("6 932,56 %")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Описание показателя «доходность XIRR, годовая»",
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
      "совокупная прибыль, годовая",
      "прибыль после налога",
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

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/bond/RU000A_TEST"]}>
        <Routes>
          <Route path="/bond/:secid" element={<CalculatorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
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
