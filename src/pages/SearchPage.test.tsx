import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BasicBondInfo } from "../shared/api/moex";
import { searchBasicBondInfo } from "../shared/api/moex";
import { SearchPage } from "./SearchPage";

vi.mock("../shared/api/moex", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/api/moex")>();

  return {
    ...actual,
    searchBasicBondInfo: vi.fn(),
  };
});

const searchBasicBondInfoMock = vi.mocked(searchBasicBondInfo);

describe("SearchPage", () => {
  beforeEach(() => {
    searchBasicBondInfoMock.mockReset();
  });

  it("does not search until the query has at least 3 symbols", async () => {
    const user = userEvent.setup();
    renderSearchPage();

    await user.type(screen.getByRole("searchbox", { name: "Поиск" }), "26");

    expect(searchBasicBondInfoMock).not.toHaveBeenCalled();
    expect(screen.getByText("Введите минимум 3 символа")).toBeInTheDocument();
  });

  it("shows search results and an offer badge", async () => {
    const user = userEvent.setup();
    searchBasicBondInfoMock.mockResolvedValue([
      createBond({
        secid: "RU000A106A86",
        shortname: "РЖД 001P-25R",
        isin: "RU000A106A86",
        mat_date: "2033-03-03",
        coupon_value: 42.38,
        coupon_percent: 8.5,
        offer_date: "2028-03-05",
        last_price: 94.12,
      }),
    ]);
    renderSearchPage();

    await user.type(screen.getByRole("searchbox", { name: "Поиск" }), "rzd");

    expect(await screen.findByRole("heading", { name: "РЖД 001P-25R" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /РЖД 001P-25R/i })).toHaveAttribute(
      "href",
      "/bond/RU000A106A86",
    );
    expect(screen.getByText("Уровень 1")).toHaveClass("text-emerald-700");
    expect(screen.getByText("Оферта 05.03.2028")).toBeInTheDocument();
    expect(screen.getByText("03.03.2033")).toBeInTheDocument();
    expect(screen.getByText("Дата купона")).toBeInTheDocument();
    expect(screen.getByText("20.07.2026")).toBeInTheDocument();
  });

  it("shows a warning list level badge for level 3", async () => {
    const user = userEvent.setup();
    searchBasicBondInfoMock.mockResolvedValue([
      createBond({
        secid: "RU000A106A86",
        shortname: "РЖД 001P-25R",
        list_level: 3,
      }),
    ]);
    renderSearchPage();

    await user.type(screen.getByRole("searchbox", { name: "Поиск" }), "rzd");

    expect(await screen.findByText("Уровень 3")).toHaveClass("text-amber-700");
  });

  it("sorts search results by short name", async () => {
    const user = userEvent.setup();
    searchBasicBondInfoMock.mockResolvedValue([
      createBond({ secid: "B", shortname: "ОФЗ 26240" }),
      createBond({ secid: "A", shortname: "ОФЗ 26233" }),
    ]);
    renderSearchPage();

    await user.type(screen.getByRole("searchbox", { name: "Поиск" }), "262");

    const headings = await screen.findAllByRole("heading", { level: 2 });

    expect(headings.map((heading) => heading.textContent)).toEqual([
      "ОФЗ 26233",
      "ОФЗ 26240",
    ]);
  });

  it("highlights a bond price above 100", async () => {
    const user = userEvent.setup();
    searchBasicBondInfoMock.mockResolvedValue([
      createBond({
        secid: "SU26240RMFS0",
        shortname: "ОФЗ 26240",
        last_price: 101.25,
      }),
    ]);
    renderSearchPage();

    await user.type(screen.getByRole("searchbox", { name: "Поиск" }), "26240");

    expect(await screen.findByText("101,25")).toHaveClass("text-red-600");
  });

  it("shows current yield adjusted by bond price with two fraction digits", async () => {
    const user = userEvent.setup();
    searchBasicBondInfoMock.mockResolvedValue([
      createBond({
        coupon_percent: 10,
        last_price: 80,
      }),
    ]);
    renderSearchPage();

    await user.type(screen.getByRole("searchbox", { name: "Поиск" }), "262");

    expect(await screen.findByText("Тек. доходность")).toBeInTheDocument();
    expect(screen.getByText("12,50 %")).toBeInTheDocument();
  });

  it("shows an error state when the search request fails", async () => {
    const user = userEvent.setup();
    searchBasicBondInfoMock.mockRejectedValue(new Error("MOEX request failed"));
    renderSearchPage();

    await user.type(screen.getByRole("searchbox", { name: "Поиск" }), "262");

    expect(await screen.findByText("Не удалось загрузить поиск")).toBeInTheDocument();
    expect(screen.getByText("MOEX request failed")).toBeInTheDocument();
  });
});

function renderSearchPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SearchPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function createBond(overrides: Partial<BasicBondInfo> = {}): BasicBondInfo {
  return {
    shortname: "ОФЗ 26233",
    secid: "SU26233RMFS5",
    isin: "RU000A101F94",
    mat_date: "2035-07-18",
    coupon_percent: 6.1,
    list_level: 1,
    coupon_value: 30.42,
    coupon_date: "2026-07-20",
    nkd: 12.34,
    currency_id: "SUR",
    face_unit: "SUR",
    face_value: 1000,
    coupon_period: 182,
    issue_size: 1000000,
    offer_date: null,
    prev_price: 59.34,
    last_price: null,
    reg_number: "26233RMFS",
    ...overrides,
  };
}
