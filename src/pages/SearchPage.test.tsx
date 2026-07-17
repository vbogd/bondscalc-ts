import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BasicBondInfo } from "../shared/api/moex";
import { searchBasicBondInfo } from "../shared/api/moex";
import { getPrimaryBondSnapshot } from "../shared/api/moex/client";
import { loadSearchQuery, saveSearchQuery } from "../shared/persistence";
import { SearchPage } from "./SearchPage";

vi.mock("../shared/api/moex", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/api/moex")>();
  const searchBasicBondInfo = vi.fn();

  return {
    ...actual,
    searchBasicBondInfo,
    getPrimaryBondSnapshot: vi.fn(async () => searchBasicBondInfo()),
  };
});

vi.mock("../shared/api/moex/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/api/moex/client")>();

  return { ...actual, getPrimaryBondSnapshot: vi.fn() };
});

const searchBasicBondInfoMock = vi.mocked(searchBasicBondInfo);
const getPrimaryBondSnapshotMock = vi.mocked(getPrimaryBondSnapshot);

describe("SearchPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 6, 16, 12));
    searchBasicBondInfoMock.mockReset();
    getPrimaryBondSnapshotMock.mockReset();
    getPrimaryBondSnapshotMock.mockImplementation(async () =>
      searchBasicBondInfoMock(""),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("restores the persisted search query and runs the search", async () => {
    saveSearchQuery("26233");
    searchBasicBondInfoMock.mockResolvedValue([]);

    renderSearchPage();

    expect(screen.getByRole("searchbox", { name: "Поиск" })).toHaveValue("26233");
    expect(await screen.findByText("Ничего не найдено")).toBeInTheDocument();
    expect(searchBasicBondInfoMock).toHaveBeenCalled();
  });

  it("filters a loaded snapshot locally without another MOEX request", async () => {
    const user = userEvent.setup();
    searchBasicBondInfoMock.mockResolvedValue([createBond()]);

    renderSearchPage();

    await user.type(screen.getByRole("searchbox", { name: "Поиск" }), "262");
    await screen.findByRole("heading", { name: "ОФЗ 26233" });
    await user.clear(screen.getByRole("searchbox", { name: "Поиск" }));
    await user.type(screen.getByRole("searchbox", { name: "Поиск" }), "101");

    expect(getPrimaryBondSnapshotMock).toHaveBeenCalledTimes(1);
  });

  it("persists the search query as it changes", async () => {
    const user = userEvent.setup();
    renderSearchPage();

    await user.type(screen.getByRole("searchbox", { name: "Поиск" }), "26");

    expect(loadSearchQuery()).toBe("26");
  });

  it("does not search until the query has at least 3 symbols", async () => {
    const user = userEvent.setup();
    renderSearchPage();

    await user.type(screen.getByRole("searchbox", { name: "Поиск" }), "26");

    expect(searchBasicBondInfoMock).not.toHaveBeenCalled();
    expect(screen.getByText("Введите минимум 3 символа")).toBeInTheDocument();
  });

  it("does not search for a glob pattern with fewer than three ordinary symbols", async () => {
    const user = userEvent.setup();
    renderSearchPage();

    await user.type(screen.getByRole("searchbox", { name: "Поиск" }), "???");

    expect(searchBasicBondInfoMock).not.toHaveBeenCalled();
    expect(screen.getByText("В glob-паттерне нужны 3 обычных символа")).toBeInTheDocument();
  });

  it("shows instructions for substring and glob searches", () => {
    renderSearchPage();

    expect(screen.getByRole("button", { name: "Как пользоваться поиском" })).toBeInTheDocument();
  });

  it("opens the search help by tap when a fine pointer is unavailable", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    renderSearchPage();

    await user.click(screen.getByRole("button", { name: "Как пользоваться поиском" }));

    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Поиск осуществляется по подстроке",
    );
    expect(screen.getByRole("button", { name: "Закрыть подсказку" })).toBeInTheDocument();
  });

  it("shows the mobile-first result content and links the whole item", async () => {
    const user = userEvent.setup();
    searchBasicBondInfoMock.mockResolvedValue([
      createBond({
        secid: "RZD001P25R",
        shortname: "РЖД 001P-25R",
        isin: "RU000A106A86",
        mat_date: "2028-10-16",
        coupon_value: 42.38,
        coupon_percent: 8.5,
        coupon_date: "2026-07-29",
        offer_date: "2026-11-16",
        last_price: 94.12,
      }),
    ]);
    renderSearchPage();

    await user.type(screen.getByRole("searchbox", { name: "Поиск" }), "ржд");

    expect(searchBasicBondInfoMock).not.toHaveBeenCalled();
    expect(screen.getByText("Ищем облигации")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "РЖД 001P-25R" })).toBeInTheDocument();
    expect(searchBasicBondInfoMock).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /РЖД 001P-25R/i })).toHaveAttribute(
      "href",
      "/bond/RZD001P25R",
    );
    expect(screen.getByText("RU000A106A86")).toBeInTheDocument();
    expect(screen.queryByText("RZD001P25R")).not.toBeInTheDocument();
    expect(screen.getByText("Листинг 1")).toHaveClass(
      "border-success/25",
      "bg-success/10",
      "text-success",
    );
    expect(screen.getByText("Тек. доходность")).toBeInTheDocument();
    expect(screen.getByText("9,03 %")).toHaveClass("font-semibold");
    expect(screen.getByText("94,12 %")).toBeInTheDocument();
    expect(screen.getByText("Погашение")).toBeInTheDocument();
    expect(screen.getByText("16.10.2028")).toBeInTheDocument();
    expect(screen.getByText("2 л. 3 мес.")).toBeInTheDocument();
    expect(screen.getByText("Оферта")).toBeInTheDocument();
    expect(screen.getByText("4 мес.")).toBeInTheDocument();
    expect(screen.getByText("16.11.2026")).toBeInTheDocument();
    expect(screen.getByText("Дата купона")).toBeInTheDocument();
    expect(screen.getByText("13 дн.")).toBeInTheDocument();
    expect(screen.getByText("29.07.2026")).toBeInTheDocument();
    expect(screen.getByText("Купон")).toBeInTheDocument();
    expect(screen.getByText("42,38 ₽")).toHaveClass(
      "text-sm",
      "text-muted-foreground",
    );
    expect(screen.getByText("Погашение").closest("dl")).toHaveClass(
      "text-base",
    );
    expect(screen.getByText("8,5 %")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "РЖД 001P-25R" }),
    ).toHaveClass("text-lg");
  });

  it("uses the success style for a level 2 listing badge", async () => {
    const user = userEvent.setup();
    searchBasicBondInfoMock.mockResolvedValue([
      createBond({
        secid: "RU000A106A86",
        shortname: "РЖД 001P-25R",
        list_level: 2,
      }),
    ]);
    renderSearchPage();

    await user.type(screen.getByRole("searchbox", { name: "Поиск" }), "ржд");

    expect(await screen.findByText("Листинг 2")).toHaveClass(
      "border-success/25",
      "bg-success/10",
      "text-success",
    );
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

    await user.type(screen.getByRole("searchbox", { name: "Поиск" }), "ржд");

    expect(await screen.findByText("Листинг 3")).toHaveClass(
      "border-warning/25",
      "bg-warning/10",
      "text-warning",
    );
  });

  it("sorts search results by short name", async () => {
    const user = userEvent.setup();
    searchBasicBondInfoMock.mockResolvedValue([
      createBond({ secid: "B", shortname: "ОФЗ 26240" }),
      createBond({ secid: "A", shortname: "ОФЗ 26233" }),
    ]);
    renderSearchPage();

    await user.type(screen.getByRole("searchbox", { name: "Поиск" }), "262");

    await screen.findByRole("heading", { name: "ОФЗ 26233" });
    const headings = screen.getAllByRole("heading", { level: 2 });

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

    expect(await screen.findByText("101,25 %")).toHaveClass(
      "text-destructive",
    );
  });

  it("does not highlight a bond price at 100", async () => {
    const user = userEvent.setup();
    searchBasicBondInfoMock.mockResolvedValue([
      createBond({
        secid: "SU26240RMFS0",
        shortname: "ОФЗ 26240",
        last_price: 100,
      }),
    ]);
    renderSearchPage();

    await user.type(screen.getByRole("searchbox", { name: "Поиск" }), "26240");

    expect(await screen.findByText("100 %")).not.toHaveClass(
      "text-destructive",
    );
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

  it("hides the offer row when the offer date is absent", async () => {
    const user = userEvent.setup();
    searchBasicBondInfoMock.mockResolvedValue([
      createBond({
        offer_date: null,
      }),
    ]);
    renderSearchPage();

    await user.type(screen.getByRole("searchbox", { name: "Поиск" }), "262");

    await screen.findByRole("heading", { name: "ОФЗ 26233" });
    expect(screen.queryByText("Оферта")).not.toBeInTheDocument();
  });

  it("shows today and a past relative term deterministically", async () => {
    const user = userEvent.setup();
    searchBasicBondInfoMock.mockResolvedValue([
      createBond({
        mat_date: "2026-07-16",
        coupon_date: "2026-07-04",
      }),
    ]);
    renderSearchPage();

    await user.type(screen.getByRole("searchbox", { name: "Поиск" }), "262");

    expect(await screen.findByText("сегодня")).toBeInTheDocument();
    expect(screen.getByText("12 дн. назад")).toBeInTheDocument();
  });

  it("uses days through 60 days and months starting from 61 days", async () => {
    const user = userEvent.setup();
    searchBasicBondInfoMock.mockResolvedValue([
      createBond({
        mat_date: "2026-09-14",
        coupon_date: "2026-09-15",
      }),
    ]);
    renderSearchPage();

    await user.type(screen.getByRole("searchbox", { name: "Поиск" }), "262");

    expect(await screen.findByText("60 дн.")).toBeInTheDocument();
    expect(screen.getByText("1 мес.")).toBeInTheDocument();
  });

  it("shows unknown result values as dashes", async () => {
    const user = userEvent.setup();
    searchBasicBondInfoMock.mockResolvedValue([
      createBond({
        mat_date: null,
        coupon_percent: null,
        coupon_value: null,
        coupon_period: 0,
        prev_price: null,
        last_price: null,
      }),
    ]);
    renderSearchPage();

    await user.type(screen.getByRole("searchbox", { name: "Поиск" }), "262");

    await screen.findByRole("heading", { name: "ОФЗ 26233" });

    for (const label of [
      "Тек. доходность",
      "Цена",
      "Погашение",
      "Купон",
    ]) {
      expect(screen.getByText(label).parentElement).toHaveTextContent("—");
    }
  });

  it("keeps a long title readable next to the listing badge", async () => {
    const user = userEvent.setup();
    const longTitle =
      "Очень длинное название облигации для проверки переноса на мобильном экране";
    searchBasicBondInfoMock.mockResolvedValue([
      createBond({
        shortname: longTitle,
      }),
    ]);
    renderSearchPage();

    await user.type(screen.getByRole("searchbox", { name: "Поиск" }), "262");

    const heading = await screen.findByRole("heading", { name: longTitle });
    const link = screen.getByRole("link", { name: new RegExp(longTitle) });

    expect(heading).toHaveClass("line-clamp-2");
    expect(heading.closest('[data-slot="item-content"]')).toHaveClass(
      "min-w-0",
    );
    expect(link).toHaveClass("w-full", "min-w-0");
    expect(screen.getByText("Листинг 1")).toHaveClass("shrink-0");
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
    board_id: "TQOB",
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
