"use client";

import React, { useState, useRef, useEffect } from "react";
import { Search, User, ChevronDown, Check, X } from "lucide-react";

export interface ClickUpMember {
  id: number | string;
  username: string;
  email?: string;
  initials?: string;
  profilePicture?: string | null;
}

interface SearchableMemberSelectProps {
  members: ClickUpMember[];
  selectedMemberId: string;
  onChange: (memberId: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
}

export function SearchableMemberSelect({
  members,
  selectedMemberId,
  onChange,
  placeholder = "-- Assign to Member --",
  searchPlaceholder = "Search space members...",
  className = ""
}: SearchableMemberSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedMember = members.find((m) => String(m.id) === selectedMemberId);

  const filteredMembers = members.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const nameMatch = (m.username || "").toLowerCase().includes(q);
    const emailMatch = (m.email || "").toLowerCase().includes(q);
    return nameMatch || emailMatch;
  });

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between border border-gray-300 p-2 text-xs bg-[#FFFCFB] hover:bg-[#FFFCFB] focus:bg-[#FFFCFB] focus:border-[#c9ab4c] outline-none rounded-none transition-colors text-left"
      >
        <div className="flex items-center gap-2 truncate">
          {selectedMember ? (
            <>
              <div className="w-5 h-5 bg-[#003366] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                {selectedMember.initials || selectedMember.username?.[0]?.toUpperCase() || "U"}
              </div>
              <span className="font-semibold text-gray-900 truncate">
                {selectedMember.username}
              </span>
              {selectedMember.email && (
                <span className="text-[10px] text-gray-400 truncate max-w-[140px]">
                  ({selectedMember.email})
                </span>
              )}
            </>
          ) : (
            <span className="text-gray-400 italic">{placeholder}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {selectedMember && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="text-gray-400 hover:text-gray-600 p-0.5"
              title="Clear selection"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown size={14} className="text-gray-400" />
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#FFFCFB] border border-gray-300 shadow-xl z-50 rounded-none max-h-60 flex flex-col">
          {/* Search Input Bar */}
          <div className="p-2 border-b border-gray-200 bg-[#FFFCFB] flex items-center gap-1.5 shrink-0">
            <Search size={13} className="text-gray-400 shrink-0" />
            <input
              type="text"
              autoFocus
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs bg-transparent outline-none text-gray-800"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Members List */}
          <div className="overflow-y-auto divide-y divide-gray-100 flex-1">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setIsOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-xs hover:bg-[#FFFCFB] flex items-center justify-between text-gray-500 italic"
            >
              <span>-- Unassigned --</span>
              {!selectedMemberId && <Check size={13} className="text-[#003366]" />}
            </button>

            {filteredMembers.length > 0 ? (
              filteredMembers.map((m) => {
                const isSelected = String(m.id) === selectedMemberId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onChange(String(m.id));
                      setIsOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-xs hover:bg-blue-50/60 flex items-center justify-between transition-colors ${
                      isSelected ? "bg-blue-50 font-bold" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div className="w-5 h-5 bg-[#003366] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        {m.initials || m.username?.[0]?.toUpperCase() || "U"}
                      </div>
                      <div className="truncate">
                        <div className="text-gray-900 font-medium truncate leading-tight">
                          {m.username}
                        </div>
                        {m.email && (
                          <div className="text-[10px] text-gray-400 truncate leading-tight">
                            {m.email}
                          </div>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check size={13} className="text-[#003366] shrink-0 ml-2" />}
                  </button>
                );
              })
            ) : (
              <div className="p-3 text-center text-xs text-gray-400">
                No space members found matching &ldquo;{searchQuery}&rdquo;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
