# Mobile trade formatting

Mobile uses the web client's default `en-NG` conventions. Naira prices use
the ₦ symbol and two fraction digits. cNGN and USDC display two fraction digits,
while XLM supports up to seven. Trade quantities use locale grouping and retain
the unit supplied by the API. Dates use day-month-year order in the device's
time zone. Formatting is display-only and leaves API amounts and units intact.
