import { Chart } from '../components/Chart';
import { mockApi } from '../services/api';

export const Reports = () => {
  const chartData = mockApi.getChartData();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold text-white">Reports</h1>

      <div className="grid gap-6">
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-tm-text-color03">
            Weekly Performance
          </h2>
          <Chart data={chartData} className="h-[300px]" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-t from-tm-neutral-color06 to-tm-neutral-color05 border border-border-subtle rounded-lg p-6 shadow-low-elevation">
            <h3 className="text-lg font-semibold text-tm-text-color03 mb-4">
              Top Performers
            </h3>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-tm-text-color08">Emma Wilson</span>
                <span className="text-tm-success-color05 font-bold">$2,500</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-tm-text-color08">Sarah Johnson</span>
                <span className="text-tm-success-color05 font-bold">$1,800</span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-t from-tm-neutral-color06 to-tm-neutral-color05 border border-border-subtle rounded-lg p-6 shadow-low-elevation">
            <h3 className="text-lg font-semibold text-tm-text-color03 mb-4">
              Engagement Metrics
            </h3>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-tm-text-color08">Total Views</span>
                <span className="text-tm-text-color02 font-bold">45,230</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-tm-text-color08">Active Sessions</span>
                <span className="text-tm-text-color02 font-bold">1,842</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
