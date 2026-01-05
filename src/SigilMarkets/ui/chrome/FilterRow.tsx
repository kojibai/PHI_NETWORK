import { Segmented } from '../atoms/Segmented';

interface FilterRowProps {
  value: string;
  onChange: (value: string) => void;
}

export const FilterRow = ({ value, onChange }: FilterRowProps) => {
  return (
    <div className="sm-filter-row">
      <Segmented
        options={[
          { value: "all", label: "All" },
          { value: "open", label: "Open" },
          { value: "locked", label: "Locked" },
          { value: "resolved", label: "Resolved" },
        ]}
        value={value}
        onChange={onChange}
      />
    </div>
  );
};
