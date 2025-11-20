import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TimingTableComponent } from './timing-table.component';

describe('TimingTableComponent', () => {
  let component: TimingTableComponent;
  let fixture: ComponentFixture<TimingTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TimingTableComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(TimingTableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
