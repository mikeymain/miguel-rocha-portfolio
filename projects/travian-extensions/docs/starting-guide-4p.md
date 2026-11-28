# Starting guide: 4 party farming

Travian QoL → settings → **Build order** → **Starting guide · 4 party farming**.

The step list follows the 4 party farming start from the community "Settling" spreadsheet by Caim (tab *2 - 4P - Farming*, marked there as being tested). Costs, rewards, culture points (CP) and population are the sheet's Roman numbers; building costs are the same for every tribe. Farm unit counts and costs are tribe specific and left as manual steps.

## How it works

- A step is ticked automatically when the game shows it done: resource field levels come from the resources view, building levels from the village centre. Open both once per village.
- Counts are cumulative. "Cropland 1x to 4" followed by "Cropland 2nd to 4" needs two croplands at level 4.
- Tasks, culture point targets, population targets, parties, settlers and troops cannot be read, so tick them by hand.
- The guide leads the Build order tab until every required step is done, then moves below the other cards. While the account has one village it also drives the in-game highlight: the resource field on the resources view, the building on the village centre view. The payback highlight returns once the second village is settled. Steps ticked by hand are skipped, and steps that need a building to be built from scratch have no highlight.
- The highlighted row is the next required step. **Optional** rows are skipped by the highlight and the progress count.
- **Cost** is the sheet's cost. **Net res/CP** is (cost - task reward) / CP per day gained, for steps that give CP.

## Improvements found

Computed from the sheet's own numbers (`features/build-order/guide-4p.js`, tested in `tests/travianqol-guide.test.cjs`).

1. **Net cost per CP.** Most expensive steps: Residence 10 (5,967), Residence 7 (4,053), Smithy 3 (2,570), Warehouse 7 (2,198), Residence 3 (2,185), Barracks 3 (1,535), Granary 7 (1,258). Cheapest: crannies 7x to 3 (255) and to 7 (818). Residence 10 is needed for the settlers, and Barracks 3 and Smithy 3 unlock the Academy and Stable, so none can be dropped. Place them next to reward-paying steps.
2. **Level 5 fields after party 1 are optional.** The sheet's own ROI estimates for level 5 fields are 67 to 83 hours, against a settle time of about 95 to 120 hours. Level 5 wood, clay and iron are marked optional.
3. **Iron mines.** The sheet advises against iron mines. The early iron steps (levels 2 to 4) cost 7,175 and pay 4,500 in task rewards for 8 CP per day, about 334 res per CP, cheaper than any building in the sheet's cheap CP list, so they stay in the main path. Level 5 iron (8,400 cost, 2,700 reward, no CP) is the weakest step and is optional.
4. **Cheap CP tail.** The sheet's list of the cheapest CP per resource buildings (1,033 to 1,360 res per CP: Embassy 9 to 12, Main Building 14 to 16, Academy 11 and 12, Marketplace 14, Rally Point 3) is added at the end as optional steps, for when CP runs short before party 4.

## To verify in game

- The sheet's *Tasks* tab lists the second tier of Main Building, Granary, Warehouse, Marketplace, Cranny and Wall tasks at level 10, but the guide pays that tier's reward at level 3 or 6. Barracks 1 and Rally Point 1 show 300 on the *Tasks* tab and 600 in the guide. If your server's tasks follow the *Tasks* tab, the net costs above are too low for those steps and the best order may change. Compare with your in-game task list.
