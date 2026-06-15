import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { BasicBondInfo, BondDetails } from "../shared/api/moex";
import { getBasicBondInfo, getBondDetails } from "../shared/api/moex";
import { CalculatorPage } from "./CalculatorPage";

vi.mock("../shared/api/moex", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/api/moex")>();

  return {
    ...actual,
    getBasicBondInfo: vi.fn(),
    getBondDetails: vi.fn(),
  };
});

const getBasicBondInfoMock = vi.mocked(getBasicBondInfo);
const getBondDetailsMock = vi.mocked(getBondDetails);

describe("CalculatorPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    getBasicBondInfoMock.mockReset();
    getBondDetailsMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads selected bond data and uses the offer mode when an offer exists", async () => {
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
    expect(screen.queryByText("НКД")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Оферта" })).toHaveClass("bg-blue-600");
    expect(screen.getByLabelText("цена выхода, %")).toHaveValue("99.5");
    expect(screen.getByText("168,70 ₽")).toBeInTheDocument();
    expect(screen.getByText("18,48 %")).toBeInTheDocument();
  });

  it("disables offer mode and falls back to maturity when there is no offer", async () => {
    getBasicBondInfoMock.mockResolvedValue(createBond({ offer_date: null }));
    getBondDetailsMock.mockResolvedValue(
      createDetails({ nextOfferDate: null, offerSchedule: [] }),
    );

    renderCalculatorPage();

    expect(await screen.findByRole("heading", { name: "Тест 001" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Погашение" })).toHaveClass("bg-blue-600");
    expect(screen.getByRole("button", { name: "Оферта" })).toBeDisabled();
    expect(screen.getByLabelText("дата выхода")).toHaveValue("2030-06-15");
  });

  it("switches to sale mode and recalculates after field changes", async () => {
    const user = userEvent.setup();
    getBasicBondInfoMock.mockResolvedValue(createBond());
    getBondDetailsMock.mockResolvedValue(createDetails());

    renderCalculatorPage();

    await screen.findByRole("heading", { name: "Тест 001" });
    await user.click(screen.getByRole("button", { name: "Продажа" }));
    await user.clear(screen.getByLabelText("цена продажи, %"));
    await user.type(screen.getByLabelText("цена продажи, %"), "110");

    expect(screen.getByLabelText("дата продажи")).toHaveValue("2026-06-16");
    expect(screen.getByLabelText("цена продажи, %")).toHaveValue("110");
    expect(screen.getByText("173,24 ₽")).toBeInTheDocument();
    expect(screen.getByText("6 927,33 %")).toBeInTheDocument();
    expect(screen.queryByText("купоны, оценка")).not.toBeInTheDocument();
    expect(screen.queryByText("к покупке")).not.toBeInTheDocument();
  });

  it("shows an error state when bond data cannot be loaded", async () => {
    getBasicBondInfoMock.mockRejectedValue(new Error("MOEX request failed"));
    getBondDetailsMock.mockResolvedValue(createDetails());

    renderCalculatorPage();

    expect(await screen.findByText("Не удалось открыть калькулятор")).toBeInTheDocument();
    expect(screen.getByText("MOEX request failed")).toBeInTheDocument();
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
    ...overrides,
  };
}
