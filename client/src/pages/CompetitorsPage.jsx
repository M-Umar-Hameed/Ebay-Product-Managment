import React, { useState } from 'react';
import ListingsHeading from '../componentsForHome/ListingsHeading';
import EntriesAndSearchBar from '../componentsForHome/EntriesAndSearchBar';
import ListingsTable from '../componentsForHome/ListingsTable';
import PaginationBar from '../componentsForHome/PaginationBar';
import AssignCompetitorRule from '../componentsForHome/AssignCompetitorRule';

export default function CompetitorsPage() {
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [itemsPerPage] = useState(10);

  const handleTotalPagesChange = (newTotalPages) => {
    setTotalPages(newTotalPages);
    if (page > newTotalPages) {
      setPage(1);
    }
  };

  return (
    <>
      <ListingsHeading
        title="Competitor Management"
        subtitle="Manage competitor rules and monitor competition across your listings"
      />
      <AssignCompetitorRule />
      <EntriesAndSearchBar />
      <ListingsTable
        currentPage={page}
        itemsPerPage={itemsPerPage}
        onTotalPagesChange={handleTotalPagesChange}
      />
      <PaginationBar
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </>
  );
}

