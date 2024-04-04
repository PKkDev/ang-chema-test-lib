import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UiLibComponent } from './ui-lib.component';

describe('UiLibComponent', () => {
  let component: UiLibComponent;
  let fixture: ComponentFixture<UiLibComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [UiLibComponent]
    });
    fixture = TestBed.createComponent(UiLibComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
